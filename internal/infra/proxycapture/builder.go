package proxycapture

import (
	"encoding/base64"
	"strings"

	_ "google.golang.org/genproto/googleapis/rpc/errdetails"
	spb "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/anypb"

	"github.com/radiantbald/gripmock/v3/internal/infra/stuber"
)

const grpcStatusDetailsBinHeader = "grpc-status-details-bin"

func ResponseHeaders(head metadata.MD, tail metadata.MD) map[string]string {
	if len(head) == 0 && len(tail) == 0 {
		return nil
	}

	out := make(map[string]string)

	appendHeaders := func(source metadata.MD) {
		for key, values := range source {
			if len(values) == 0 {
				continue
			}

			joined := strings.Join(values, ";")
			if previous, ok := out[key]; ok && previous != "" {
				out[key] = previous + ";" + joined
			} else {
				out[key] = joined
			}
		}
	}

	appendHeaders(head)
	appendHeaders(tail)

	if len(out) == 0 {
		return nil
	}

	return out
}

func BuildUnaryStub(
	service string,
	method string,
	room string,
	request map[string]any,
	requestHeaders map[string]any,
	response map[string]any,
	responseHeaders map[string]string,
	callErr error,
) *stuber.Stub {
	stub := &stuber.Stub{
		Service: service,
		Method:  method,
		Room:    room,
		Source:  stuber.SourceProxy,
		Headers: stuber.InputHeader{Equals: requestHeaders},
		Input:   stuber.InputData{Equals: request},
		Output:  stuber.Output{Data: response, Headers: responseHeaders},
	}

	applyStatusError(&stub.Output, callErr, true)

	return stub
}

func BuildServerStreamStub(
	service string,
	method string,
	room string,
	request map[string]any,
	requestHeaders map[string]any,
	responses []map[string]any,
	responseHeaders map[string]string,
	callErr error,
) *stuber.Stub {
	stub := &stuber.Stub{
		Service: service,
		Method:  method,
		Room:    room,
		Source:  stuber.SourceProxy,
		Headers: stuber.InputHeader{Equals: requestHeaders},
		Input:   stuber.InputData{Equals: request},
		Output:  stuber.Output{Stream: toStreamOutput(responses), Headers: responseHeaders},
	}

	applyStatusError(&stub.Output, callErr, false)

	return stub
}

func BuildClientStreamStub(
	service string,
	method string,
	room string,
	requests []map[string]any,
	requestHeaders map[string]any,
	response map[string]any,
	responseHeaders map[string]string,
	callErr error,
) *stuber.Stub {
	stub := &stuber.Stub{
		Service: service,
		Method:  method,
		Room:    room,
		Source:  stuber.SourceProxy,
		Headers: stuber.InputHeader{Equals: requestHeaders},
		Inputs:  toInputs(requests),
		Output:  stuber.Output{Data: response, Headers: responseHeaders},
	}

	applyStatusError(&stub.Output, callErr, true)

	return stub
}

func BuildBidiStub(
	service string,
	method string,
	room string,
	requests []map[string]any,
	requestHeaders map[string]any,
	responses []map[string]any,
	responseHeaders map[string]string,
	callErr error,
) *stuber.Stub {
	stub := &stuber.Stub{
		Service: service,
		Method:  method,
		Room:    room,
		Source:  stuber.SourceProxy,
		Headers: stuber.InputHeader{Equals: requestHeaders},
		Inputs:  toInputs(requests),
		Output:  stuber.Output{Stream: toStreamOutput(responses), Headers: responseHeaders},
	}

	applyStatusError(&stub.Output, callErr, false)

	return stub
}

func toInputs(requests []map[string]any) []stuber.InputData {
	inputs := make([]stuber.InputData, 0, len(requests))
	for _, request := range requests {
		inputs = append(inputs, stuber.InputData{Equals: request})
	}

	return inputs
}

func toStreamOutput(responses []map[string]any) []any {
	streamOutput := make([]any, 0, len(responses))
	for _, response := range responses {
		streamOutput = append(streamOutput, response)
	}

	return streamOutput
}

func applyStatusError(output *stuber.Output, callErr error, clearData bool) {
	if output == nil || callErr == nil {
		return
	}

	st := status.Convert(callErr)
	code := st.Code()

	output.Code = &code
	output.Error = st.Message()
	output.Details = CaptureStatusDetails(callErr, output.Headers)

	if clearData {
		output.Data = nil
	}
}

// CaptureStatusDetails converts gRPC status details from an error, falling back
// to grpc-status-details-bin in response headers/trailers when the error has no details.
func CaptureStatusDetails(callErr error, headers map[string]string) []map[string]any {
	if details := StatusDetailsToMaps(callErr); len(details) > 0 {
		return details
	}

	return StatusDetailsFromHeaders(headers)
}

// StatusDetailsToMaps converts gRPC status details from an error into JSON maps.
func StatusDetailsToMaps(callErr error) []map[string]any {
	if callErr == nil {
		return nil
	}

	return mapsFromAnyDetails(status.Convert(callErr).Proto().GetDetails())
}

// StatusDetailsFromHeaders extracts gRPC status details from grpc-status-details-bin.
func StatusDetailsFromHeaders(headers map[string]string) []map[string]any {
	if len(headers) == 0 {
		return nil
	}

	raw, ok := headers[grpcStatusDetailsBinHeader]
	if !ok || raw == "" {
		return nil
	}

	stProto := &spb.Status{}
	if err := proto.Unmarshal([]byte(raw), stProto); err != nil {
		return nil
	}

	return mapsFromAnyDetails(stProto.GetDetails())
}

func mapsFromAnyDetails(details []*anypb.Any) []map[string]any {
	if len(details) == 0 {
		return nil
	}

	out := make([]map[string]any, 0, len(details))
	for _, anyDetail := range details {
		mapped := anyDetailToMap(anyDetail)
		if mapped == nil {
			continue
		}

		out = append(out, mapped)
	}

	if len(out) == 0 {
		return nil
	}

	return out
}

func anyDetailToMap(anyDetail *anypb.Any) map[string]any {
	if anyDetail == nil {
		return nil
	}

	typeURL := anyDetail.GetTypeUrl()
	if typeURL == "" {
		return nil
	}

	msg, err := anyDetail.UnmarshalNew()
	if err == nil {
		mapped := MessageToMap(msg)
		if mapped == nil {
			mapped = map[string]any{}
		}

		mapped["type"] = typeURL

		return mapped
	}

	return map[string]any{
		"type":  typeURL,
		"value": base64.StdEncoding.EncodeToString(anyDetail.GetValue()),
	}
}

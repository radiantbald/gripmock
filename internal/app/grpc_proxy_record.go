package app

import (
	"context"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"

	"github.com/bavix/gripmock/v3/internal/domain/history"
	"github.com/bavix/gripmock/v3/internal/infra/proxycapture"
	"github.com/bavix/gripmock/v3/internal/infra/stuber"
	"github.com/bavix/gripmock/v3/internal/infra/types"
)

func requestHeadersFromMetadata(md metadata.MD) map[string]any {
	if len(md) == 0 {
		return nil
	}

	return processHeaders(md)
}

func responseHeadersFromMetadata(head metadata.MD, tail metadata.MD) map[string]string {
	return proxycapture.ResponseHeaders(head, tail)
}

func messageToMap(message proto.Message) map[string]any {
	return proxycapture.MessageToMap(message)
}

func (m *grpcMocker) recordCapturedStub(
	build func() *stuber.Stub,
	recordDelay bool,
	elapsed time.Duration,
) {
	stub := build()
	if stub == nil {
		return
	}

	if recordDelay && elapsed > 0 {
		stub.Output.Delay = types.Duration(elapsed)
	}

	m.budgerigar.PutMany(stub)
}

func (m *grpcMocker) recordProxyCall(
	ctx context.Context,
	timestamp time.Time,
	requests []map[string]any,
	responses []map[string]any,
	responseTimestamps []time.Time,
	callErr error,
) {
	if m.recorder == nil || len(requests) == 0 {
		return
	}

	if responses == nil {
		responses = []map[string]any{}
	}

	record := history.CallRecord{
		CallID:             uuid.NewString(),
		Transport:          "proxy",
		Service:            m.fullServiceName,
		Method:             m.methodName,
		Session:            m.sessionFromContext(ctx),
		Client:             clientFromContext(ctx),
		Requests:           requests,
		Responses:          responses,
		ResponseTimestamps: responseTimestamps,
		Timestamp:          timestamp,
	}

	if len(requests) > 0 {
		record.Request = requests[0]
	}
	if len(responses) > 0 {
		record.Response = responses[0]
	}

	if callErr != nil {
		record.Error = callErr.Error()

		if st, ok := status.FromError(callErr); ok {
			record.Code = uint32(st.Code())
			if st.Message() != "" {
				record.Error = st.Message()
			}
		} else {
			record.Code = uint32(codes.Unknown)
		}
	} else {
		record.Code = uint32(codes.OK)
	}

	m.recorder.Record(record)
}

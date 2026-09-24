package proxycapture_test

import (
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	spb "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/anypb"

	"github.com/radiantbald/gripmock/v3/internal/infra/proxycapture"
)

func TestStatusDetailsToMapsErrorInfo(t *testing.T) {
	t.Parallel()

	st, err := status.New(codes.InvalidArgument, "DEPOSIT_AMOUNT_EXPECTED").WithDetails(&errdetails.ErrorInfo{
		Reason: "DEPOSIT_AMOUNT_EXPECTED",
		Domain: "blockchain.adapter",
	})
	require.NoError(t, err)

	details := proxycapture.StatusDetailsToMaps(st.Err())
	require.Len(t, details, 1)
	require.Equal(t, "type.googleapis.com/google.rpc.ErrorInfo", details[0]["type"])
	require.Equal(t, "DEPOSIT_AMOUNT_EXPECTED", details[0]["reason"])
	require.Equal(t, "blockchain.adapter", details[0]["domain"])
}

func TestStatusDetailsToMapsKeepsUnknownAny(t *testing.T) {
	t.Parallel()

	raw := []byte{0x01, 0x02, 0x03}
	st := status.FromProto(&spb.Status{
		Code:    int32(codes.Internal),
		Message: "unknown detail",
		Details: []*anypb.Any{{
			TypeUrl: "type.googleapis.com/custom.UnknownDetail",
			Value:   raw,
		}},
	})

	details := proxycapture.StatusDetailsToMaps(st.Err())
	require.Len(t, details, 1)
	require.Equal(t, "type.googleapis.com/custom.UnknownDetail", details[0]["type"])
	require.Equal(t, base64.StdEncoding.EncodeToString(raw), details[0]["value"])
}

func TestCaptureStatusDetailsFallsBackToTrailer(t *testing.T) {
	t.Parallel()

	anyDetail, err := anypb.New(&errdetails.ErrorInfo{
		Reason: "DEPOSIT_AMOUNT_EXPECTED",
		Domain: "blockchain.adapter",
	})
	require.NoError(t, err)

	raw, err := proto.Marshal(&spb.Status{
		Code:    int32(codes.InvalidArgument),
		Message: "DEPOSIT_AMOUNT_EXPECTED",
		Details: []*anypb.Any{anyDetail},
	})
	require.NoError(t, err)

	details := proxycapture.CaptureStatusDetails(
		status.Error(codes.InvalidArgument, "DEPOSIT_AMOUNT_EXPECTED"),
		map[string]string{"grpc-status-details-bin": string(raw)},
	)
	require.Len(t, details, 1)
	require.Equal(t, "type.googleapis.com/google.rpc.ErrorInfo", details[0]["type"])
	require.Equal(t, "DEPOSIT_AMOUNT_EXPECTED", details[0]["reason"])
	require.Equal(t, "blockchain.adapter", details[0]["domain"])
}

func TestBuildUnaryStubCopiesTrailerDetails(t *testing.T) {
	t.Parallel()

	anyDetail, err := anypb.New(&errdetails.ErrorInfo{
		Reason: "DEPOSIT_AMOUNT_EXPECTED",
		Domain: "blockchain.adapter",
	})
	require.NoError(t, err)

	raw, err := proto.Marshal(&spb.Status{
		Code:    int32(codes.InvalidArgument),
		Message: "DEPOSIT_AMOUNT_EXPECTED",
		Details: []*anypb.Any{anyDetail},
	})
	require.NoError(t, err)

	stub := proxycapture.BuildUnaryStub(
		"processing.crypto.v1.ProcessingCrypto",
		"CreateDepositAddress",
		"",
		map[string]any{"currencyId": "1"},
		nil,
		map[string]any{"address": "unused"},
		map[string]string{"grpc-status-details-bin": string(raw)},
		status.Error(codes.InvalidArgument, "DEPOSIT_AMOUNT_EXPECTED"),
	)

	require.Equal(t, "DEPOSIT_AMOUNT_EXPECTED", stub.Output.Error)
	require.NotNil(t, stub.Output.Code)
	require.Equal(t, codes.InvalidArgument, *stub.Output.Code)
	require.Nil(t, stub.Output.Data)
	require.Len(t, stub.Output.Details, 1)
	require.Equal(t, "DEPOSIT_AMOUNT_EXPECTED", stub.Output.Details[0]["reason"])
	require.Equal(t, "blockchain.adapter", stub.Output.Details[0]["domain"])
}

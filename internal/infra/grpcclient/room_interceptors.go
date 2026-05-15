package grpcclient

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

const roomHeader = "x-gripmock-room"

// UnaryRoomInterceptor injects gripmock room header into unary calls.
func UnaryRoomInterceptor(room string) grpc.UnaryClientInterceptor {
	return func(
		ctx context.Context,
		method string,
		req,
		reply any,
		conn *grpc.ClientConn,
		invoker grpc.UnaryInvoker,
		opts ...grpc.CallOption,
	) error {
		if room != "" {
			ctx = metadata.AppendToOutgoingContext(ctx, roomHeader, room)
		}

		return invoker(ctx, method, req, reply, conn, opts...)
	}
}

// StreamRoomInterceptor injects gripmock room header into stream calls.
func StreamRoomInterceptor(room string) grpc.StreamClientInterceptor {
	return func(
		ctx context.Context,
		desc *grpc.StreamDesc,
		cc *grpc.ClientConn,
		method string,
		streamer grpc.Streamer,
		opts ...grpc.CallOption,
	) (grpc.ClientStream, error) {
		if room != "" {
			ctx = metadata.AppendToOutgoingContext(ctx, roomHeader, room)
		}

		return streamer(ctx, desc, cc, method, opts...)
	}
}

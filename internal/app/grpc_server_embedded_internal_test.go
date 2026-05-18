package app

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"

	"github.com/bavix/gripmock/v3/internal/domain/descriptors"
	"github.com/bavix/gripmock/v3/internal/domain/history"
	"github.com/bavix/gripmock/v3/internal/domain/protoset"
	protosetdom "github.com/bavix/gripmock/v3/internal/domain/protoset"
	"github.com/bavix/gripmock/v3/internal/infra/proxyroutes"
	"github.com/bavix/gripmock/v3/internal/infra/stuber"
)

//nolint:paralleltest
func TestBuildFromDescriptorSetGreeter(t *testing.T) {
	ctx := t.Context()
	protoPath := filepath.Join("..", "..", "examples", "projects", "greeter", "service.proto")
	fdsSlice, err := protoset.Build(ctx, nil, []string{protoPath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, fdsSlice)

	budgerigar := stuber.NewBudgerigar()
	waiter := NewInstantExtender()

	server, err := BuildFromDescriptorSet(ctx, fdsSlice[0], budgerigar, waiter, nil)
	require.NoError(t, err)
	require.NotNil(t, server)

	defer server.GracefulStop()
}

//nolint:paralleltest
func TestGRPCServerBuildWithoutStartupDescriptors(t *testing.T) {
	ctx := t.Context()

	server := NewGRPCServer(
		"tcp",
		":0",
		nil,
		stuber.NewBudgerigar(),
		NewInstantExtender(),
		nil,
		descriptors.NewRegistry(),
		nil,
		nil,
		false,
		nil,
	)

	grpcServer, err := server.Build(ctx)
	require.NoError(t, err)
	require.NotNil(t, grpcServer)

	defer grpcServer.GracefulStop()
}

//nolint:paralleltest
func TestGRPCServerFindMethodDescriptorFromDynamicRegistry(t *testing.T) {
	ctx := t.Context()
	protoPath := filepath.Join("..", "..", "examples", "projects", "greeter", "service.proto")
	fdsSlice, err := protoset.Build(ctx, nil, []string{protoPath}, nil)
	require.NoError(t, err)

	files, err := protodesc.NewFiles(fdsSlice[0])
	require.NoError(t, err)

	registry := descriptors.NewRegistry()

	files.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		registry.Register(fd)

		return true
	})

	server := NewGRPCServer(
		"tcp",
		":0",
		nil,
		stuber.NewBudgerigar(),
		NewInstantExtender(),
		nil,
		registry,
		nil,
		nil,
		false,
		nil,
	)

	method, err := server.findMethodDescriptor("helloworld.Greeter", "SayHello")
	require.NoError(t, err)
	require.Equal(t, "helloworld.HelloRequest", string(method.Input().FullName()))
	require.Equal(t, "helloworld.HelloReply", string(method.Output().FullName()))
}

//nolint:paralleltest
func TestReflectionReplayRouteFallsBackToUpstreamOnStubMiss(t *testing.T) {
	ctx := t.Context()
	protoPath := filepath.Join("..", "..", "examples", "projects", "greeter", "service.proto")
	fdsSlice, err := protoset.Build(ctx, nil, []string{protoPath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, fdsSlice)

	files, err := protodesc.NewFiles(fdsSlice[0])
	require.NoError(t, err)
	method := findMethodInFiles(t, files, "helloworld.Greeter", "SayHello")

	upstreamStubs := stuber.NewBudgerigar()
	upstreamStubs.PutMany(&stuber.Stub{
		Service: "helloworld.Greeter",
		Method:  "SayHello",
		Input:   stuber.InputData{Contains: map[string]any{}},
		Output:  stuber.Output{Data: map[string]any{"message": "from upstream"}},
	})
	upstreamServer, err := BuildFromDescriptorSet(ctx, fdsSlice[0], upstreamStubs, NewInstantExtender(), nil)
	require.NoError(t, err)
	defer upstreamServer.GracefulStop()
	upstreamAddr := serveTestGRPCServer(t, ctx, upstreamServer)

	registry := descriptors.NewRegistry()
	files.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		registry.Register(fd)
		return true
	})

	routes := proxyroutes.NewEmpty()
	t.Cleanup(routes.Close)
	require.NoError(t, routes.RegisterDescriptorSet(
		&protosetdom.Source{ReflectAddress: upstreamAddr},
		fdsSlice[0],
		proxyroutes.ModeReplay,
	))

	recorder := history.NewMemoryStore(0)
	mockServer := NewGRPCServer(
		"tcp",
		":0",
		nil,
		stuber.NewBudgerigar(),
		NewInstantExtender(),
		recorder,
		registry,
		nil,
		nil,
		false,
		nil,
	)
	mockServer.SetProxyRoutes(routes)
	grpcServer, err := mockServer.Build(ctx)
	require.NoError(t, err)
	defer grpcServer.GracefulStop()
	mockAddr := serveTestGRPCServer(t, ctx, grpcServer)

	conn, err := grpc.NewClient(mockAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	require.NoError(t, err)
	defer func() { require.NoError(t, conn.Close()) }()

	req := dynamicpb.NewMessage(method.Input())
	resp := dynamicpb.NewMessage(method.Output())
	require.NoError(t, conn.Invoke(ctx, "/helloworld.Greeter/SayHello", req, resp))
	require.Equal(t, "from upstream", resp.Get(method.Output().Fields().ByName("message")).String())

	calls := recorder.All()
	require.Len(t, calls, 1)
	require.Equal(t, "proxy", calls[0].Transport)
	require.Equal(t, uint32(0), calls[0].Code)
}

//nolint:paralleltest
func TestReflectionRouteModeOverrideIsRoomScoped(t *testing.T) {
	ctx := t.Context()
	protoPath := filepath.Join("..", "..", "examples", "projects", "greeter", "service.proto")
	fdsSlice, err := protoset.Build(ctx, nil, []string{protoPath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, fdsSlice)

	registry := descriptors.NewRegistry()
	files, err := protodesc.NewFiles(fdsSlice[0])
	require.NoError(t, err)
	files.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		registry.Register(fd)
		return true
	})

	routes := proxyroutes.NewEmpty()
	t.Cleanup(routes.Close)
	require.NoError(t, routes.RegisterDescriptorSet(
		&protosetdom.Source{ReflectAddress: "upstream.test:50051"},
		fdsSlice[0],
		proxyroutes.ModeReplay,
	))
	require.True(t, routes.SetMethodModeForRoom("proxy-room", "/helloworld.Greeter/SayHello", proxyroutes.ModeProxy))

	mocker := &grpcMocker{
		fullMethod: "/helloworld.Greeter/SayHello",
		proxies:    routes,
	}

	stubRoomCtx := metadata.NewIncomingContext(ctx, metadata.Pairs(roomHeaderKey, "stub-room"))
	require.Equal(t, proxyroutes.ModeReplay, mocker.proxyRoute(stubRoomCtx).Mode)

	proxyRoomCtx := metadata.NewIncomingContext(ctx, metadata.Pairs(roomHeaderKey, "proxy-room"))
	require.Equal(t, proxyroutes.ModeProxy, mocker.proxyRoute(proxyRoomCtx).Mode)
}

func findMethodInFiles(
	t *testing.T,
	files *protoregistry.Files,
	serviceName string,
	methodName string,
) protoreflect.MethodDescriptor {
	t.Helper()

	desc, err := files.FindDescriptorByName(protoreflect.FullName(serviceName))
	require.NoError(t, err)
	service, ok := desc.(protoreflect.ServiceDescriptor)
	require.True(t, ok)
	method := service.Methods().ByName(protoreflect.Name(methodName))
	require.NotNil(t, method)

	return method
}

func serveTestGRPCServer(t *testing.T, ctx context.Context, server *grpc.Server) string {
	t.Helper()

	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp", "127.0.0.1:0")
	require.NoError(t, err)

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Serve(listener)
	}()

	t.Cleanup(func() {
		server.Stop()
		err := <-errCh
		if err != nil {
			require.ErrorIs(t, err, grpc.ErrServerStopped)
		}
	})

	return listener.Addr().String()
}

//nolint:paralleltest
func TestGRPCServerBuildRegistersPersistedDescriptors(t *testing.T) {
	ctx := t.Context()
	protoPath := filepath.Join(t.TempDir(), "persisted_runtime.proto")
	err := os.WriteFile(protoPath, []byte(`syntax = "proto3";
package persisted.runtime;

service RuntimeService {
  rpc Echo (EchoRequest) returns (EchoReply);
}

message EchoRequest {
  string message = 1;
}

message EchoReply {
  string message = 1;
}
`), 0o644)
	require.NoError(t, err)

	fdsSlice, err := protoset.Build(ctx, nil, []string{protoPath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, fdsSlice)

	registry := descriptors.NewRegistry()
	server := NewGRPCServer(
		"tcp",
		":0",
		nil,
		stuber.NewBudgerigar(),
		NewInstantExtender(),
		nil,
		registry,
		nil,
		nil,
		false,
		nil,
	)

	server.SetProtoMetadataWriter(&grpcProtoMetadataLoaderStub{loaded: fdsSlice})

	grpcServer, err := server.Build(ctx)
	require.NoError(t, err)
	require.NotNil(t, grpcServer)
	defer grpcServer.GracefulStop()

	method, err := server.findMethodDescriptor("persisted.runtime.RuntimeService", "Echo")
	require.NoError(t, err)
	require.Equal(t, "persisted.runtime.EchoRequest", string(method.Input().FullName()))
	require.Equal(t, "persisted.runtime.EchoReply", string(method.Output().FullName()))
	require.Contains(t, registry.ServiceIDs(), "persisted.runtime.RuntimeService")
}

//nolint:paralleltest
func TestGRPCServerBuildRegistersPersistedDescriptorsWithWKTImport(t *testing.T) {
	ctx := t.Context()
	protoPath := filepath.Join(t.TempDir(), "persisted_wkt.proto")
	err := os.WriteFile(protoPath, []byte(`syntax = "proto3";
package persisted.wkt;

import "google/protobuf/timestamp.proto";

service WKTService {
  rpc Echo (EchoRequest) returns (EchoReply);
}

message EchoRequest {
  google.protobuf.Timestamp at = 1;
}

message EchoReply {
  google.protobuf.Timestamp at = 1;
}
`), 0o644)
	require.NoError(t, err)

	fdsSlice, err := protoset.Build(ctx, nil, []string{protoPath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, fdsSlice)

	registry := descriptors.NewRegistry()
	server := NewGRPCServer(
		"tcp",
		":0",
		nil,
		stuber.NewBudgerigar(),
		NewInstantExtender(),
		nil,
		registry,
		nil,
		nil,
		false,
		nil,
	)

	server.SetProtoMetadataWriter(&grpcProtoMetadataLoaderStub{loaded: fdsSlice})

	grpcServer, err := server.Build(ctx)
	require.NoError(t, err)
	require.NotNil(t, grpcServer)
	defer grpcServer.GracefulStop()

	method, err := server.findMethodDescriptor("persisted.wkt.WKTService", "Echo")
	require.NoError(t, err)
	require.Equal(t, "persisted.wkt.EchoRequest", string(method.Input().FullName()))
	require.Equal(t, "persisted.wkt.EchoReply", string(method.Output().FullName()))
	require.Contains(t, registry.ServiceIDs(), "persisted.wkt.WKTService")
}

//nolint:paralleltest
func TestGRPCServerBuildContinuesWhenPersistedDescriptorsInvalid(t *testing.T) {
	ctx := t.Context()
	stripped, err := buildCorruptedPersistedDescriptorSet(ctx, t.TempDir(), "persisted_invalid.proto", "persisted.invalid")
	require.NoError(t, err)

	registry := descriptors.NewRegistry()
	server := NewGRPCServer(
		"tcp",
		":0",
		nil,
		stuber.NewBudgerigar(),
		NewInstantExtender(),
		nil,
		registry,
		nil,
		nil,
		false,
		nil,
	)
	server.SetProtoMetadataWriter(&grpcProtoMetadataLoaderStub{
		loaded: []*descriptorpb.FileDescriptorSet{stripped},
	})

	grpcServer, err := server.Build(ctx)
	require.NoError(t, err)
	require.NotNil(t, grpcServer)
	defer grpcServer.GracefulStop()
}

//nolint:paralleltest
func TestGRPCServerBuildFailsWhenPersistedDescriptorsInvalidInStrictMode(t *testing.T) {
	ctx := t.Context()
	stripped, err := buildCorruptedPersistedDescriptorSet(ctx, t.TempDir(), "persisted_invalid_strict.proto", "persisted.invalid.strict")
	require.NoError(t, err)

	registry := descriptors.NewRegistry()
	server := NewGRPCServer(
		"tcp",
		":0",
		nil,
		stuber.NewBudgerigar(),
		NewInstantExtender(),
		nil,
		registry,
		nil,
		nil,
		false,
		nil,
	)
	server.SetStrictPersistedDescriptorStartup(true)
	server.SetProtoMetadataWriter(&grpcProtoMetadataLoaderStub{
		loaded: []*descriptorpb.FileDescriptorSet{stripped},
	})

	_, err = server.Build(ctx)
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to register persisted descriptors")
}

func buildCorruptedPersistedDescriptorSet(
	ctx context.Context,
	dir string,
	fileName string,
	pkg string,
) (*descriptorpb.FileDescriptorSet, error) {
	protoPath := filepath.Join(dir, fileName)
	err := os.WriteFile(protoPath, []byte(`syntax = "proto3";
package `+pkg+`;

service InvalidService {
  rpc Echo (EchoRequest) returns (EchoReply);
}

message EchoRequest {
  string value = 1;
}

message EchoReply {
  string value = 1;
}
`), 0o644)
	if err != nil {
		return nil, err
	}

	fdsSlice, err := protoset.Build(ctx, nil, []string{protoPath}, nil)
	if err != nil {
		return nil, err
	}
	if len(fdsSlice) == 0 || len(fdsSlice[0].GetFile()) == 0 {
		return nil, fmt.Errorf("empty descriptor set")
	}

	cloned, _ := proto.Clone(fdsSlice[0].GetFile()[0]).(*descriptorpb.FileDescriptorProto)
	cloned.Dependency = append(cloned.Dependency, "acme/missing.proto")

	return &descriptorpb.FileDescriptorSet{File: []*descriptorpb.FileDescriptorProto{cloned}}, nil
}

type grpcProtoMetadataLoaderStub struct {
	loaded []*descriptorpb.FileDescriptorSet
}

func (s *grpcProtoMetadataLoaderStub) ReplaceDescriptorFiles(context.Context, string, []protoreflect.FileDescriptor) error {
	return nil
}

func (s *grpcProtoMetadataLoaderStub) ReplaceDescriptorSets(context.Context, string, []*descriptorpb.FileDescriptorSet) error {
	return nil
}

func (s *grpcProtoMetadataLoaderStub) LoadDescriptorSets(context.Context) ([]*descriptorpb.FileDescriptorSet, error) {
	return s.loaded, nil
}

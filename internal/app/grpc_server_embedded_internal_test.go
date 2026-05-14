package app

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"

	"github.com/bavix/gripmock/v3/internal/domain/descriptors"
	"github.com/bavix/gripmock/v3/internal/domain/protoset"
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

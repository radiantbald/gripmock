package app

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"

	protoloc "github.com/bavix/gripmock/v3/internal/domain/proto"
	protosetdom "github.com/bavix/gripmock/v3/internal/domain/protoset"
	"github.com/bavix/gripmock/v3/internal/infra/stuber"
)

type protoMetadataWriterMock struct {
	replaceFilesSource string
	replaceFilesCalls  int
	replaceSetsSource  string
	replaceSetsCalls   int
	filesErr           error
	setsErr            error
}

func (m *protoMetadataWriterMock) ReplaceDescriptorFiles(
	_ context.Context,
	source string,
	_ []protoreflect.FileDescriptor,
) error {
	m.replaceFilesSource = source
	m.replaceFilesCalls++

	return m.filesErr
}

func (m *protoMetadataWriterMock) ReplaceDescriptorSets(
	_ context.Context,
	source string,
	_ []*descriptorpb.FileDescriptorSet,
) error {
	m.replaceSetsSource = source
	m.replaceSetsCalls++

	return m.setsErr
}

func TestAddDescriptorsRollbackOnMetadataPersistError(t *testing.T) {
	server, err := NewRestServer(t.Context(), stuber.NewBudgerigar(), &mockExtender{}, nil, nil, nil)
	require.NoError(t, err)

	mockWriter := &protoMetadataWriterMock{filesErr: context.DeadlineExceeded}
	server.SetProtoMetadataWriter(mockWriter)

	descriptorSetBytes := compileGreeterDescriptorSetBytes(t)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/descriptors", bytes.NewReader(descriptorSetBytes))
	req.Header.Set("Content-Type", "application/octet-stream")
	w := httptest.NewRecorder()

	server.AddDescriptors(w, req)

	require.Equal(t, http.StatusBadRequest, w.Code)
	require.Empty(t, server.restDescriptors.ServiceIDs())
	require.Equal(t, 1, mockWriter.replaceFilesCalls)
	require.Equal(t, descriptorSourceREST, mockWriter.replaceFilesSource)
}

func TestGRPCBuildPersistsStartupDescriptorMetadata(t *testing.T) {
	params := protoloc.New(
		[]string{filepath.Join("..", "..", "examples", "projects", "greeter", "service.proto")},
		nil,
	)

	server := NewGRPCServer(
		"tcp",
		"127.0.0.1:0",
		params,
		stuber.NewBudgerigar(),
		nil,
		nil,
		nil,
		nil,
		nil,
		false,
		nil,
	)

	mockWriter := &protoMetadataWriterMock{}
	server.SetProtoMetadataWriter(mockWriter)

	grpcServer, err := server.Build(t.Context())
	require.NoError(t, err)
	require.NotNil(t, grpcServer)
	grpcServer.Stop()

	require.Equal(t, 1, mockWriter.replaceSetsCalls)
	require.Equal(t, descriptorSourceStartup, mockWriter.replaceSetsSource)
}

func compileGreeterDescriptorSetBytes(t *testing.T) []byte {
	t.Helper()

	protoPath := filepath.Join("..", "..", "examples", "projects", "greeter", "service.proto")
	descriptorSets, err := protosetdom.Build(t.Context(), nil, []string{protoPath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, descriptorSets)

	out, err := proto.Marshal(descriptorSets[0])
	require.NoError(t, err)

	return out
}

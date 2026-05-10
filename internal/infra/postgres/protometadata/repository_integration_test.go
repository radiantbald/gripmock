package protometadata

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/descriptorpb"

	protosetdom "github.com/bavix/gripmock/v3/internal/domain/protoset"
	pgmigrations "github.com/bavix/gripmock/v3/internal/infra/postgres/migrations"
)

func TestRepositoryReplaceDescriptorSets(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not set")
	}

	ctx := t.Context()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.NoError(t, pgmigrations.Apply(ctx, pool))

	repo := NewRepository(pool)
	clearProtoMetadataTables(t, pool)

	protoPath := filepath.Join("..", "..", "..", "..", "..", "examples", "projects", "greeter", "service.proto")
	descriptorSets, err := protosetdom.Build(ctx, nil, []string{protoPath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, descriptorSets)

	require.NoError(t, repo.ReplaceDescriptorSets(ctx, "test", descriptorSets))
	assertProtoMetadataCounts(t, pool, 1, 1, 1, 1)
	assertCount(t, pool, `SELECT COUNT(*) FROM protofiles WHERE payload IS NOT NULL`, 1)
	assertCount(t, pool, `SELECT COUNT(*) FROM protofiles WHERE source = 'test'`, 1)
	assertHistoryActionCount(t, pool, actionCreated, 1)
	assertHistoryActionCount(t, pool, actionNoop, 0)
	assertHistoryActionCount(t, pool, actionReplaced, 0)
	assertAPIHistoryEventCount(t, pool, eventServiceAdded, 1)
	assertAPIHistoryEventCount(t, pool, eventMethodAdded, 1)

	require.NoError(t, repo.ReplaceDescriptorSets(ctx, "test", descriptorSets))
	assertProtoMetadataCounts(t, pool, 1, 1, 1, 1)
	assertHistoryActionCount(t, pool, actionCreated, 1)
	assertHistoryActionCount(t, pool, actionNoop, 1)
	assertAPIHistoryEventCount(t, pool, eventServiceAdded, 1)
	assertAPIHistoryEventCount(t, pool, eventMethodAdded, 1)

	updatedDescriptorSet := cloneDescriptorSet(descriptorSets[0])
	updatedDescriptorSet.File[0].Service[0].Method = append(
		updatedDescriptorSet.File[0].Service[0].Method,
		&descriptorpb.MethodDescriptorProto{
			Name:       ptr("SayHelloAgain"),
			InputType:  ptr(".helloworld.HelloRequest"),
			OutputType: ptr(".helloworld.HelloReply"),
		},
	)

	require.NoError(t, repo.ReplaceDescriptorSets(ctx, "test", []*descriptorpb.FileDescriptorSet{updatedDescriptorSet}))
	assertProtoMetadataCounts(t, pool, 1, 1, 1, 2)
	assertCount(t, pool, `SELECT COUNT(*) FROM protofiles WHERE payload IS NOT NULL`, 1)
	assertCount(t, pool, `SELECT COUNT(*) FROM protofiles WHERE source = 'test'`, 1)
	assertHistoryActionCount(t, pool, actionReplaced, 1)
	assertAPIHistoryEventCount(t, pool, eventMethodAdded, 2)
	assertAPIHistoryEventCount(t, pool, eventMethodSignatureChanged, 0)

	var version int64
	err = pool.QueryRow(ctx, `SELECT version FROM protofiles LIMIT 1`).Scan(&version)
	require.NoError(t, err)
	require.Equal(t, int64(2), version)
}

func TestRepositoryDeleteProtofile(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not set")
	}

	ctx := t.Context()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.NoError(t, pgmigrations.Apply(ctx, pool))

	repo := NewRepository(pool)
	clearProtoMetadataTables(t, pool)

	protoPath := filepath.Join("..", "..", "..", "..", "..", "examples", "projects", "greeter", "service.proto")
	descriptorSets, err := protosetdom.Build(ctx, nil, []string{protoPath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, descriptorSets)

	require.NoError(t, repo.ReplaceDescriptorSets(ctx, "test", descriptorSets))
	assertProtoMetadataCounts(t, pool, 1, 1, 1, 1)

	deleted, err := repo.DeleteProtofile(ctx, "service.proto")
	require.NoError(t, err)
	require.True(t, deleted.Removed)
	require.Contains(t, deleted.ServiceIDs, "helloworld.Greeter")
	require.Contains(t, deleted.ServiceMethods, ServiceMethodRef{
		ServiceID: "helloworld.Greeter",
		MethodID:  "SayHello",
	})

	assertProtoMetadataCounts(t, pool, 0, 0, 0, 0)

	notFound, err := repo.DeleteProtofile(ctx, "service.proto")
	require.NoError(t, err)
	require.False(t, notFound.Removed)
}

func clearProtoMetadataTables(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	_, err := pool.Exec(t.Context(), `
		TRUNCATE TABLE proto_api_history, protofile_history, methods, services, packages, protofiles, descriptor_files
		RESTART IDENTITY CASCADE
	`)
	require.NoError(t, err)
}

func assertProtoMetadataCounts(
	t *testing.T,
	pool *pgxpool.Pool,
	protofiles int,
	packages int,
	services int,
	methods int,
) {
	t.Helper()

	assertCount(t, pool, `SELECT COUNT(*) FROM protofiles`, protofiles)
	assertCount(t, pool, `SELECT COUNT(*) FROM packages`, packages)
	assertCount(t, pool, `SELECT COUNT(*) FROM services`, services)
	assertCount(t, pool, `SELECT COUNT(*) FROM methods`, methods)
}

func assertHistoryActionCount(t *testing.T, pool *pgxpool.Pool, action string, expected int) {
	t.Helper()
	assertCount(t, pool, `SELECT COUNT(*) FROM protofile_history WHERE action = $1`, expected, action)
}

func assertAPIHistoryEventCount(t *testing.T, pool *pgxpool.Pool, eventType string, expected int) {
	t.Helper()
	assertCount(t, pool, `SELECT COUNT(*) FROM proto_api_history WHERE event_type = $1`, expected, eventType)
}

func assertCount(t *testing.T, pool *pgxpool.Pool, query string, expected int, args ...any) {
	t.Helper()

	var actual int
	err := pool.QueryRow(t.Context(), query, args...).Scan(&actual)
	require.NoError(t, err)
	require.Equal(t, expected, actual)
}

func cloneDescriptorSet(input *descriptorpb.FileDescriptorSet) *descriptorpb.FileDescriptorSet {
	if input == nil {
		return nil
	}

	clone, _ := proto.Clone(input).(*descriptorpb.FileDescriptorSet)

	return clone
}

func ptr(value string) *string {
	return &value
}

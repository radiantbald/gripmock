package rooms

import (
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	pgmigrations "github.com/radiantbald/gripmock/v3/internal/infra/postgres/migrations"
)

func TestRepositoryDeleteByName(t *testing.T) {
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
	roomName := "integration-delete-room"

	require.NoError(t, repo.Touch(ctx, roomName, "owner-1"))
	require.NoError(t, repo.Touch(ctx, roomName, "owner-2"))

	deleted, err := repo.DeleteByName(ctx, roomName)
	require.NoError(t, err)
	require.Equal(t, 2, deleted)

	rooms, err := repo.List(ctx)
	require.NoError(t, err)
	require.NotContains(t, rooms, roomName)
}

func TestRepositoryCreate_AllowsMultipleRoomsForSameOwner(t *testing.T) {
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
	firstName := "integration-owner-room-1"
	secondName := "integration-owner-room-2"
	owner := "owner-shared"

	firstRow, err := repo.Create(ctx, firstName, owner)
	require.NoError(t, err)
	require.Equal(t, firstName, firstRow.Name)

	secondRow, err := repo.Create(ctx, secondName, owner)
	require.NoError(t, err)
	require.Equal(t, secondName, secondRow.Name)
	require.NotEqual(t, firstRow.ID, secondRow.ID)

	rows, err := repo.ListRows(ctx)
	require.NoError(t, err)

	namesByID := map[int64]string{}
	for _, row := range rows {
		namesByID[row.ID] = row.Name
	}

	require.Equal(t, firstName, namesByID[firstRow.ID])
	require.Equal(t, secondName, namesByID[secondRow.ID])
}

func TestRepositoryCreate_AllowsDuplicateNamesForSameOwner(t *testing.T) {
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
	roomName := "integration-duplicate-room-name"
	owner := "owner-duplicate-name"

	firstRow, err := repo.Create(ctx, roomName, owner)
	require.NoError(t, err)
	require.Equal(t, roomName, firstRow.Name)

	secondRow, err := repo.Create(ctx, roomName, owner)
	require.NoError(t, err)
	require.Equal(t, roomName, secondRow.Name)
	require.NotEqual(t, firstRow.ID, secondRow.ID)
}

func TestRepositoryCreatorByID(t *testing.T) {
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
	owner := "owner-for-creator-lookup"
	row, err := repo.Create(ctx, "creator-lookup-room", owner)
	require.NoError(t, err)

	creator, err := repo.CreatorByID(ctx, row.ID)
	require.NoError(t, err)
	require.Equal(t, owner, creator)

	missingCreator, err := repo.CreatorByID(ctx, -1)
	require.NoError(t, err)
	require.Equal(t, "", missingCreator)
}

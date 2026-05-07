package stubs

import (
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	pgmigrations "github.com/bavix/gripmock/v3/internal/infra/postgres/migrations"
	"github.com/bavix/gripmock/v3/internal/infra/stuber"
)

func TestRepositoryRoundTripAndHydrate(t *testing.T) {
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
	require.NoError(t, repo.Clear(ctx))
	t.Cleanup(func() {
		_ = repo.Clear(ctx)
	})

	initial := &stuber.Stub{
		Service: "integration.v1.Service",
		Method:  "Ping",
		Name:    "postgres-roundtrip",
		Source:  stuber.SourceRest,
		Input: stuber.InputData{
			Equals: map[string]any{"id": "1"},
		},
		Output: stuber.Output{
			Data: map[string]any{"message": "v1"},
		},
	}

	// Save through Budgerigar (DB-first path).
	creator := stuber.NewBudgerigar()
	creator.SetPersistentStore(repo)
	ids := creator.PutMany(initial)
	require.Len(t, ids, 1)
	require.Len(t, creator.All(), 1)

	// Update through Budgerigar.
	initial.Name = "postgres-roundtrip-updated"
	initial.Output.Data["message"] = "v2"
	initial.SetEnabled(false)

	updated := creator.UpdateMany(initial)
	require.Len(t, updated, 1)

	fromDB, err := repo.LoadAll(ctx)
	require.NoError(t, err)
	require.Len(t, fromDB, 1)
	require.Equal(t, "postgres-roundtrip-updated", fromDB[0].Name)
	require.Equal(t, "v2", fromDB[0].Output.Data["message"])
	require.False(t, fromDB[0].IsEnabled())

	// Simulate process restart: fresh in-memory index must rehydrate from DB.
	afterRestart := stuber.NewBudgerigar()
	afterRestart.SetPersistentStore(repo)
	require.NoError(t, afterRestart.HydrateFromPersistent(ctx))

	rehydrated := afterRestart.All()
	require.Len(t, rehydrated, 1)
	require.Equal(t, "integration.v1.Service", rehydrated[0].Service)
	require.Equal(t, "Ping", rehydrated[0].Method)
	require.Equal(t, "postgres-roundtrip-updated", rehydrated[0].Name)
	require.Equal(t, "v2", rehydrated[0].Output.Data["message"])
	require.False(t, rehydrated[0].IsEnabled())

	// Delete and confirm removal in DB.
	deleted := afterRestart.DeleteByID(ids[0])
	require.Equal(t, 1, deleted)

	remaining, err := repo.LoadAll(ctx)
	require.NoError(t, err)
	require.Len(t, remaining, 0)
}

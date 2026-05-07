package sessions

import (
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	pgmigrations "github.com/bavix/gripmock/v3/internal/infra/postgres/migrations"
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
	sessionName := "integration-delete-session"

	require.NoError(t, repo.Touch(ctx, sessionName, "owner-1"))
	require.NoError(t, repo.Touch(ctx, sessionName, "owner-2"))

	deleted, err := repo.DeleteByName(ctx, sessionName)
	require.NoError(t, err)
	require.Equal(t, 2, deleted)

	sessions, err := repo.List(ctx)
	require.NoError(t, err)
	require.NotContains(t, sessions, sessionName)
}

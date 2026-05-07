package deps

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/bavix/gripmock/v3/internal/config"
)

func TestEnsurePersistenceRequiresDSN(t *testing.T) {
	builder := NewBuilder(WithConfig(config.Config{}))

	err := builder.EnsurePersistence(t.Context())
	require.Error(t, err)
	require.Contains(t, err.Error(), "POSTGRES_DSN is required")
}

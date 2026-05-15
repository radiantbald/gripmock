package config_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/bavix/gripmock/v3/internal/config"
)

func TestConfigRoomGCDefaults(t *testing.T) {
	t.Parallel()

	// Arrange

	// Act
	cfg := config.Load()

	// Assert
	require.Equal(t, 30*time.Second, cfg.RoomGCInterval)
	require.Equal(t, 60*time.Second, cfg.RoomGCTTL)
}

func TestConfigRoomGCOverride(t *testing.T) {
	// Arrange
	t.Setenv("ROOM_GC_INTERVAL", "3s")
	t.Setenv("ROOM_GC_TTL", "45s")

	// Act
	cfg := config.Load()

	// Assert
	require.Equal(t, 3*time.Second, cfg.RoomGCInterval)
	require.Equal(t, 45*time.Second, cfg.RoomGCTTL)
}

package muxmiddleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/radiantbald/gripmock/v3/internal/infra/muxmiddleware"
	"github.com/radiantbald/gripmock/v3/internal/infra/room"
)

func TestConsumeRequestMovesHeaderToContext(t *testing.T) {
	t.Parallel()

	// Arrange
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	req.Header.Set(muxmiddleware.HeaderName, "  A  ")

	// Act
	consumed := muxmiddleware.ConsumeRequest(req)
	got := muxmiddleware.FromRequest(consumed)

	// Assert
	require.Equal(t, "A", got)
	require.Empty(t, consumed.Header.Get(muxmiddleware.HeaderName))
}

func TestConsumeRequestStoresOwnerInContext(t *testing.T) {
	t.Parallel()

	// Arrange
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	req.Header.Set(muxmiddleware.OwnerHeaderName, "client-1")

	// Act
	consumed := muxmiddleware.ConsumeRequest(req)
	ownerID := muxmiddleware.OwnerFromContext(consumed.Context())

	// Assert
	require.Equal(t, "client-1", ownerID)
}

func TestConsumeRequestDefaultGlobalAsEmptyRoom(t *testing.T) {
	t.Parallel()

	// Arrange
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)

	// Act
	consumed := muxmiddleware.ConsumeRequest(req)
	got := muxmiddleware.FromRequest(consumed)

	// Assert
	require.Empty(t, got)
}

func TestConsumeRequestWithResetHintForForgottenRoom(t *testing.T) {
	t.Parallel()

	// Arrange
	roomID := "forgotten-room-only"
	room.Forget(roomID)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	req.Header.Set(muxmiddleware.HeaderName, roomID)

	// Act
	consumed, resetHint := muxmiddleware.ConsumeRequestWithResetHint(req)
	got := muxmiddleware.FromRequest(consumed)

	// Assert
	require.True(t, resetHint)
	require.Empty(t, got)
	require.Empty(t, consumed.Header.Get(muxmiddleware.HeaderName))
}

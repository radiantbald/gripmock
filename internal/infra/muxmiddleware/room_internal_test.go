package muxmiddleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/radiantbald/gripmock/v3/internal/infra/room"
)

func TestTransportRoomMovesHeaderToContextAndStripsHeader(t *testing.T) {
	t.Parallel()

	// Arrange
	var (
		gotRoom string
		gotHeader  string
	)

	h := TransportRoom(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		gotRoom = FromRequest(r)
		gotHeader = r.Header.Get(HeaderName)
	}))

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	req.Header.Set(HeaderName, "A")

	w := httptest.NewRecorder()

	// Act
	h.ServeHTTP(w, req)

	// Assert
	require.Equal(t, "A", gotRoom)
	require.Empty(t, gotHeader)
}

func TestTransportRoomSetsResetHeaderForForgottenRoom(t *testing.T) {
	t.Parallel()

	// Arrange
	roomID := "transport-forgotten-room"
	room.Forget(roomID)

	var gotRoom string
	h := TransportRoom(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		gotRoom = FromRequest(r)
	}))

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	req.Header.Set(HeaderName, roomID)

	w := httptest.NewRecorder()

	// Act
	h.ServeHTTP(w, req)

	// Assert
	require.Empty(t, gotRoom)
	require.Equal(t, "1", w.Header().Get(ResetHeaderName))
}

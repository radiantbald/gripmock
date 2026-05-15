package room_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/bavix/gripmock/v3/internal/infra/room"
)

func TestTrackerExpiredAndForget(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := room.NewTracker()
	now := time.Now()
	tracker.Touch("A", now.Add(-2*time.Minute))
	tracker.Touch("B", now)

	// Act
	roomsBeforeForget := tracker.Rooms()
	expired := tracker.Expired(now, time.Minute)
	tracker.Forget("A")
	expiredAfterForget := tracker.Expired(now, 0)
	roomsAfterForget := tracker.Rooms()

	// Assert
	require.Equal(t, []string{"A", "B"}, roomsBeforeForget)
	require.Equal(t, []string{"A"}, expired)
	require.Equal(t, []string{"B"}, expiredAfterForget)
	require.Equal(t, []string{"B"}, roomsAfterForget)
}

func TestTrackerForgetBlocksImmediateReuse(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := room.NewTracker()
	now := time.Now()
	tracker.Touch("A", now)
	tracker.Forget("A")

	// Act
	forgottenNow := tracker.IsForgotten("A", now)
	tracker.Touch("A", now)
	roomsAfterImmediateTouch := tracker.Rooms()

	// Assert
	require.True(t, forgottenNow)
	require.Empty(t, roomsAfterImmediateTouch)
}

func TestTrackerCanDeleteOnlyByOwner(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := room.NewTracker()
	now := time.Now()
	tracker.TouchWithOwner("A", "owner-1", now)

	// Act
	canDeleteByOwner := tracker.CanDelete("A", "owner-1")
	canDeleteByOther := tracker.CanDelete("A", "owner-2")
	canDeleteWithoutOwner := tracker.CanDelete("A", "")

	// Assert
	require.True(t, canDeleteByOwner)
	require.False(t, canDeleteByOther)
	require.False(t, canDeleteWithoutOwner)
}

func TestTrackerAssignClientAndResolveRoom(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := room.NewTracker()

	// Act
	ok := tracker.AssignClient("172.21.0.4", "A")
	mapped := tracker.RoomByClient("172.21.0.4")

	// Assert
	require.True(t, ok)
	require.Equal(t, "A", mapped)
}

func TestTrackerForgetRoomRemovesClientRoutes(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := room.NewTracker()
	now := time.Now()
	tracker.Touch("A", now)
	tracker.AssignClient("172.21.0.4", "A")

	// Act
	tracker.Forget("A")
	mapped := tracker.RoomByClient("172.21.0.4")

	// Assert
	require.Empty(t, mapped)
}

func TestTrackerUnassignClient(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := room.NewTracker()
	tracker.AssignClient("172.21.0.4", "A")

	// Act
	removed := tracker.UnassignClient("172.21.0.4")
	mapped := tracker.RoomByClient("172.21.0.4")

	// Assert
	require.True(t, removed)
	require.Empty(t, mapped)
}

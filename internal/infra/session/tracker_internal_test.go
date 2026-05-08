package session_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/bavix/gripmock/v3/internal/infra/session"
)

func TestTrackerExpiredAndForget(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := session.NewTracker()
	now := time.Now()
	tracker.Touch("A", now.Add(-2*time.Minute))
	tracker.Touch("B", now)

	// Act
	sessionsBeforeForget := tracker.Sessions()
	expired := tracker.Expired(now, time.Minute)
	tracker.Forget("A")
	expiredAfterForget := tracker.Expired(now, 0)
	sessionsAfterForget := tracker.Sessions()

	// Assert
	require.Equal(t, []string{"A", "B"}, sessionsBeforeForget)
	require.Equal(t, []string{"A"}, expired)
	require.Equal(t, []string{"B"}, expiredAfterForget)
	require.Equal(t, []string{"B"}, sessionsAfterForget)
}

func TestTrackerForgetBlocksImmediateReuse(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := session.NewTracker()
	now := time.Now()
	tracker.Touch("A", now)
	tracker.Forget("A")

	// Act
	forgottenNow := tracker.IsForgotten("A", now)
	tracker.Touch("A", now)
	sessionsAfterImmediateTouch := tracker.Sessions()

	// Assert
	require.True(t, forgottenNow)
	require.Empty(t, sessionsAfterImmediateTouch)
}

func TestTrackerCanDeleteOnlyByOwner(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := session.NewTracker()
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

func TestTrackerAssignClientAndResolveSession(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := session.NewTracker()

	// Act
	ok := tracker.AssignClient("172.21.0.4", "A")
	mapped := tracker.SessionByClient("172.21.0.4")

	// Assert
	require.True(t, ok)
	require.Equal(t, "A", mapped)
}

func TestTrackerForgetSessionRemovesClientRoutes(t *testing.T) {
	t.Parallel()

	// Arrange
	tracker := session.NewTracker()
	now := time.Now()
	tracker.Touch("A", now)
	tracker.AssignClient("172.21.0.4", "A")

	// Act
	tracker.Forget("A")
	mapped := tracker.SessionByClient("172.21.0.4")

	// Assert
	require.Empty(t, mapped)
}

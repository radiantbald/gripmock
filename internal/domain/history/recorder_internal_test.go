package history_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/bavix/gripmock/v3/internal/domain/history"
)

func TestMemoryStoreDeleteSessionRemovesOnlySessionRecords(t *testing.T) {
	t.Parallel()

	// Arrange
	store := &history.MemoryStore{}
	store.Record(history.CallRecord{Service: "svc", Method: "A", Session: "s1"})
	store.Record(history.CallRecord{Service: "svc", Method: "B", Session: "s2"})
	store.Record(history.CallRecord{Service: "svc", Method: "C", Session: ""})

	// Act
	deleted := store.DeleteSession("s1")

	// Assert
	require.Equal(t, 1, deleted)

	all := store.All()
	require.Len(t, all, 2)
	require.Equal(t, "s2", all[0].Session)
	require.Empty(t, all[1].Session)
}

func TestMemoryStoreDeleteSessionEmptySessionNop(t *testing.T) {
	t.Parallel()

	// Arrange
	store := &history.MemoryStore{}
	store.Record(history.CallRecord{Service: "svc", Method: "A", Session: "s1"})

	// Act
	deleted := store.DeleteSession("")

	// Assert
	require.Equal(t, 0, deleted)
	require.Len(t, store.All(), 1)
}

func TestMemoryStoreRecordSetsDefaults(t *testing.T) {
	t.Parallel()

	store := history.NewMemoryStore(0)
	store.Record(history.CallRecord{Service: "svc", Method: "M"})

	records := store.All()
	require.Len(t, records, 1)
	require.NotEmpty(t, records[0].CallID)
	require.Equal(t, "mock", records[0].Transport)
	require.False(t, records[0].Timestamp.IsZero())
}

func TestMemoryStoreSubscribeReceivesEvents(t *testing.T) {
	t.Parallel()

	store := history.NewMemoryStore(0)
	events, unsubscribe := store.Subscribe(1)
	defer unsubscribe()

	store.Record(history.CallRecord{Service: "svc", Method: "M"})

	select {
	case event := <-events:
		require.Equal(t, "svc", event.Service)
		require.Equal(t, "M", event.Method)
		require.Equal(t, "mock", event.Transport)
		require.NotEmpty(t, event.CallID)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected history event")
	}
}

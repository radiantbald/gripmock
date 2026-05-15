package deps

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/bavix/gripmock/v3/internal/config"
	"github.com/bavix/gripmock/v3/internal/domain/history"
	"github.com/bavix/gripmock/v3/internal/infra/room"
	"github.com/bavix/gripmock/v3/internal/infra/stuber"
)

func putStub(b *Builder, roomID, message string) {
	b.Budgerigar().PutMany(&stuber.Stub{
		ID:      uuid.New(),
		Service: "svc.Greeter",
		Method:  "SayHello",
		Room: roomID,
		Output:  stuber.Output{Data: map[string]any{"message": message}},
	})
}

func putHistory(b *Builder, roomID string) {
	b.HistoryStore().Record(history.CallRecord{
		Service: "svc.Greeter",
		Method:  "SayHello",
		Room: roomID,
	})
}

//nolint:paralleltest
func TestBuilderCleanupExpiredRoomsRemovesTouchedRoomData(t *testing.T) {
	b := NewBuilder(WithConfig(config.Config{HistoryEnabled: true}))
	roomA := "A-" + uuid.NewString()
	roomB := "B-" + uuid.NewString()
	putStub(b, roomA, "A")
	putStub(b, roomB, "B")
	putHistory(b, roomA)
	putHistory(b, roomB)

	room.Touch(roomA)

	b.cleanupExpiredRooms(t.Context(), time.Now(), 0)

	all := b.Budgerigar().All()
	require.Len(t, all, 1)
	require.Equal(t, roomB, all[0].Room)

	records := b.HistoryStore().All()
	require.Len(t, records, 1)
	require.Equal(t, roomB, records[0].Room)
}

//nolint:paralleltest
func TestBuilderCleanupExpiredRoomsDoesNotDeleteGlobalRoom(t *testing.T) {
	b := NewBuilder(WithConfig(config.Config{HistoryEnabled: true}))
	roomA := "A-" + uuid.NewString()
	putStub(b, "", "GLOBAL")
	putStub(b, roomA, "A")
	putHistory(b, "")
	putHistory(b, roomA)

	room.Touch(roomA)

	b.cleanupExpiredRooms(t.Context(), time.Now(), 0)

	all := b.Budgerigar().All()
	require.Len(t, all, 1)
	require.Empty(t, all[0].Room)
	require.Equal(t, "GLOBAL", all[0].Output.Data["message"])

	records := b.HistoryStore().All()
	require.Len(t, records, 1)
	require.Empty(t, records[0].Room)
}

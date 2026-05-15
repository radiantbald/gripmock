package stuber

import (
	"context"
)

type RoomEnabledState struct {
	StubID  uint64
	Room    string
	Enabled bool
}

// PersistentStore is a durable storage backend for stubs.
type PersistentStore interface {
	UpsertMany(ctx context.Context, stubs ...*Stub) ([]uint64, error)
	UpsertRoomState(ctx context.Context, updates ...RoomEnabledState) error
	LoadRoomState(ctx context.Context) ([]RoomEnabledState, error)
	DeleteByID(ctx context.Context, ids ...uint64) (int, error)
	DeleteRoom(ctx context.Context, room string) (int, error)
	Clear(ctx context.Context) error
	LoadAll(ctx context.Context) ([]*Stub, error)
}

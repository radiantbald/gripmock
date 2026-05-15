package stuber

import (
	"context"

	"github.com/google/uuid"
)

// PersistentStore is a durable storage backend for stubs.
type PersistentStore interface {
	UpsertMany(ctx context.Context, stubs ...*Stub) ([]uuid.UUID, error)
	DeleteByID(ctx context.Context, ids ...uuid.UUID) (int, error)
	DeleteRoom(ctx context.Context, room string) (int, error)
	Clear(ctx context.Context) error
	LoadAll(ctx context.Context) ([]*Stub, error)
}

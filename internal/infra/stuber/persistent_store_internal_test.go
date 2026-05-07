package stuber

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakePersistentStore struct {
	upsertErr error
	items     []*Stub
}

func (f *fakePersistentStore) UpsertMany(_ context.Context, stubs ...*Stub) ([]uuid.UUID, error) {
	if f.upsertErr != nil {
		return nil, f.upsertErr
	}

	f.items = append(f.items, stubs...)

	ids := make([]uuid.UUID, len(stubs))
	for i, item := range stubs {
		ids[i] = item.ID
	}

	return ids, nil
}

func (f *fakePersistentStore) DeleteByID(_ context.Context, _ ...uuid.UUID) (int, error) {
	return 0, nil
}

func (f *fakePersistentStore) DeleteSession(_ context.Context, _ string) (int, error) {
	return 0, nil
}

func (f *fakePersistentStore) Clear(_ context.Context) error {
	return nil
}

func (f *fakePersistentStore) LoadAll(_ context.Context) ([]*Stub, error) {
	return f.items, nil
}

func TestBudgerigarPutManyFailsClosedOnPersistentError(t *testing.T) {
	store := &fakePersistentStore{upsertErr: errors.New("db unavailable")}
	b := NewBudgerigar()
	b.SetPersistentStore(store)

	ids := b.PutMany(&Stub{
		ID:      uuid.New(),
		Service: "svc",
		Method:  "method",
		Output:  Output{Data: map[string]any{"ok": true}},
	})

	require.Empty(t, ids)
	require.Empty(t, b.All(), "in-memory store must not update when persistence fails")
}

func TestBudgerigarHydrateFromPersistent(t *testing.T) {
	store := &fakePersistentStore{
		items: []*Stub{
			{
				ID:      uuid.New(),
				Service: "svc",
				Method:  "method",
				Output:  Output{Data: map[string]any{"ok": true}},
			},
		},
	}

	b := NewBudgerigar()
	b.SetPersistentStore(store)

	err := b.HydrateFromPersistent(t.Context())
	require.NoError(t, err)
	require.Len(t, b.All(), 1)
	require.Equal(t, "svc", b.All()[0].Service)
}

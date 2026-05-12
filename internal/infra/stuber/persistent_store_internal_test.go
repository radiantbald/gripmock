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
	upsertCalls int
	items     []*Stub
}

func (f *fakePersistentStore) UpsertMany(_ context.Context, stubs ...*Stub) ([]uuid.UUID, error) {
	f.upsertCalls++
	if f.upsertErr != nil {
		return nil, f.upsertErr
	}

	byID := make(map[uuid.UUID]*Stub, len(f.items))
	for _, item := range f.items {
		byID[item.ID] = item
	}
	for _, item := range stubs {
		byID[item.ID] = item
	}
	next := make([]*Stub, 0, len(byID))
	for _, item := range byID {
		next = append(next, item)
	}
	f.items = next

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

func TestBudgerigarHydrateFromPersistentNormalizesEnabledRoute(t *testing.T) {
	enabled := true
	first := &Stub{
		ID:      uuid.New(),
		Service: "svc",
		Method:  "method",
		Enabled: &enabled,
	}
	second := &Stub{
		ID:      uuid.New(),
		Service: "svc",
		Method:  "method",
		Enabled: &enabled,
	}

	store := &fakePersistentStore{
		items: []*Stub{first, second},
	}

	b := NewBudgerigar()
	b.SetPersistentStore(store)

	err := b.HydrateFromPersistent(t.Context())
	require.NoError(t, err)
	require.Equal(t, 1, store.upsertCalls, "normalized state should be written back to persistent store")

	all := b.All()
	require.Len(t, all, 2)
	enabledCount := 0
	for _, item := range all {
		if item.IsEnabled() {
			enabledCount++
		}
	}
	require.Equal(t, 1, enabledCount, "only one enabled stub is allowed per service/method route after hydration")
	require.False(t, b.FindByID(first.ID).IsEnabled())
	require.True(t, b.FindByID(second.ID).IsEnabled())
}

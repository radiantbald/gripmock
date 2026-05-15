package stuber

import (
	"context"
	"errors"
	"github.com/stretchr/testify/require"
	"strconv"
	"testing"
)

type fakePersistentStore struct {
	upsertErr   error
	upsertCalls int
	items       []*Stub
	roomState   []RoomEnabledState
}

func (f *fakePersistentStore) UpsertMany(_ context.Context, stubs ...*Stub) ([]uint64, error) {
	f.upsertCalls++
	if f.upsertErr != nil {
		return nil, f.upsertErr
	}

	byID := make(map[uint64]*Stub, len(f.items))
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

	ids := make([]uint64, len(stubs))
	for i, item := range stubs {
		ids[i] = item.ID
	}

	return ids, nil
}

func (f *fakePersistentStore) DeleteByID(_ context.Context, _ ...uint64) (int, error) {
	return 0, nil
}

func (f *fakePersistentStore) UpsertRoomState(_ context.Context, updates ...RoomEnabledState) error {
	if len(updates) == 0 {
		return nil
	}

	idx := make(map[string]int, len(f.roomState))
	for i, item := range f.roomState {
		idx[item.Room+"|"+strconv.FormatUint(item.StubID, 10)] = i
	}
	for _, item := range updates {
		key := item.Room + "|" + strconv.FormatUint(item.StubID, 10)
		if !item.Enabled {
			if pos, ok := idx[key]; ok {
				f.roomState = append(f.roomState[:pos], f.roomState[pos+1:]...)
				idx = make(map[string]int, len(f.roomState))
				for i, state := range f.roomState {
					idx[state.Room+"|"+strconv.FormatUint(state.StubID, 10)] = i
				}
			}
			continue
		}
		if pos, ok := idx[key]; ok {
			f.roomState[pos] = item
			continue
		}
		idx[key] = len(f.roomState)
		f.roomState = append(f.roomState, item)
	}

	return nil
}

func (f *fakePersistentStore) LoadRoomState(_ context.Context) ([]RoomEnabledState, error) {
	return append([]RoomEnabledState(nil), f.roomState...), nil
}

func (f *fakePersistentStore) DeleteRoom(_ context.Context, _ string) (int, error) {
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
		ID:      1,
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
				ID:      10,
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

func TestBudgerigarHydrateFromPersistentKeepsEnabledFlags(t *testing.T) {
	enabled := true
	first := &Stub{
		ID:      11,
		Service: "svc",
		Method:  "method",
		Enabled: &enabled,
	}
	second := &Stub{
		ID:      12,
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
	require.Equal(t, 0, store.upsertCalls, "hydration should not rewrite unchanged enabled flags")

	all := b.All()
	require.Len(t, all, 2)
	enabledCount := 0
	for _, item := range all {
		if item.IsEnabled() {
			enabledCount++
		}
	}
	require.Equal(t, 2, enabledCount, "hydration keeps persisted enabled state as-is")
	require.True(t, b.FindByID(first.ID).IsEnabled())
	require.True(t, b.FindByID(second.ID).IsEnabled())
}

package stuber

import (
	"context"
	"log"
	"strings"
	"sync"

	"github.com/google/uuid"
	healthgrpc "google.golang.org/grpc/health/grpc_health_v1"
)

type Aliveness interface {
	SetAlive()
}

type Budgerigar struct {
	searcher       *searcher
	persistent     PersistentStore
	persistentLock sync.Mutex
}

func NewBudgerigar() *Budgerigar {
	return &Budgerigar{
		searcher: newSearcher(),
	}
}

// SetPersistentStore attaches durable storage backend.
func (b *Budgerigar) SetPersistentStore(store PersistentStore) {
	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	b.persistent = store
}

// HydrateFromPersistent clears in-memory index and repopulates from persistent storage.
func (b *Budgerigar) HydrateFromPersistent(ctx context.Context) error {
	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	if b.persistent == nil {
		return nil
	}

	all, err := b.persistent.LoadAll(ctx)
	if err != nil {
		return err
	}

	b.searcher.clear()
	if len(all) > 0 {
		b.searcher.upsert(all...)
	}

	return nil
}

// InternalStorage returns the internal storage interface for adding internal stubs.
// Internal stubs are hidden from user-facing APIs and take precedence in matching.
//
//nolint:ireturn
func (b *Budgerigar) InternalStorage() InternalStubStorage {
	return b.searcher.internalStorage
}

// SetAlive marks internal gripmock health stubs as SERVING.
func (b *Budgerigar) SetAlive() {
	UpdateGripmockHealthStatus(b.searcher.internalStorage, healthgrpc.HealthCheckResponse_SERVING)
}

// PutMany inserts the given Stub values. Assigns UUIDs to stubs without IDs.
func (b *Budgerigar) PutMany(values ...*Stub) []uuid.UUID {
	for _, value := range values {
		if value.ID == uuid.Nil {
			value.ID = uuid.New()
		}
	}

	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	related := b.ensureSingleEnabledByRoute(values...)
	candidates := dedupeStubsByID(append(values, related...))

	if b.persistent != nil {
		if _, err := b.persistent.UpsertMany(context.Background(), candidates...); err != nil {
			log.Printf("[gripmock] failed to persist stubs: %v", err)

			return []uuid.UUID{}
		}
	}

	b.searcher.upsert(candidates...)

	ids := make([]uuid.UUID, len(values))
	for i, value := range values {
		ids[i] = value.ID
	}

	return ids
}

// UpdateMany updates stubs that have non-nil IDs.
func (b *Budgerigar) UpdateMany(values ...*Stub) []uuid.UUID {
	updates := make([]*Stub, 0, len(values))

	for _, value := range values {
		if value.ID != uuid.Nil {
			updates = append(updates, value)
		}
	}

	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	related := b.ensureSingleEnabledByRoute(updates...)
	candidates := dedupeStubsByID(append(updates, related...))

	if b.persistent != nil {
		if _, err := b.persistent.UpsertMany(context.Background(), candidates...); err != nil {
			log.Printf("[gripmock] failed to persist updated stubs: %v", err)

			return []uuid.UUID{}
		}
	}

	b.searcher.upsert(candidates...)

	ids := make([]uuid.UUID, len(updates))
	for i, value := range updates {
		ids[i] = value.ID
	}

	return ids
}

func (b *Budgerigar) ensureSingleEnabledByRoute(values ...*Stub) []*Stub {
	if len(values) == 0 {
		return nil
	}

	latestEnabled := make([]*Stub, 0, len(values))
	changed := make([]*Stub, 0, len(values))
	for _, stub := range values {
		if !stub.IsEnabled() {
			continue
		}

		for _, previous := range latestEnabled {
			if previous.ID == stub.ID || !sameEnabledRoute(previous, stub) {
				continue
			}

			previous.SetEnabled(false)
			changed = append(changed, previous)
		}

		latestEnabled = append(latestEnabled, stub)
	}

	if len(latestEnabled) == 0 {
		return changed
	}

	for _, existing := range b.searcher.all() {
		if !existing.IsEnabled() {
			continue
		}

		for _, candidate := range latestEnabled {
			if candidate.ID == existing.ID || !sameEnabledRoute(existing, candidate) {
				continue
			}

			existing.SetEnabled(false)
			changed = append(changed, existing)
			break
		}
	}

	return changed
}

func sameEnabledRoute(left, right *Stub) bool {
	if strings.TrimSpace(left.Method) != strings.TrimSpace(right.Method) {
		return false
	}

	if strings.TrimSpace(left.Session) != strings.TrimSpace(right.Session) {
		return false
	}

	return sameServiceAlias(left.Service, right.Service)
}

func sameServiceAlias(left, right string) bool {
	left = strings.TrimSpace(left)
	right = strings.TrimSpace(right)

	if left == right {
		return true
	}

	leftShort, leftHasDot := shortServiceName(left)
	rightShort, rightHasDot := shortServiceName(right)

	if leftShort != rightShort {
		return false
	}

	// Full names are distinct unless one side is an explicit short alias.
	return !leftHasDot || !rightHasDot
}

func shortServiceName(service string) (string, bool) {
	index := strings.LastIndex(service, ".")
	if index == -1 {
		return service, false
	}

	return service[index+1:], true
}

// DeleteByID deletes the Stub values with the given IDs from the Budgerigar's searcher.
func (b *Budgerigar) DeleteByID(ids ...uuid.UUID) int {
	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	if b.persistent != nil {
		if _, err := b.persistent.DeleteByID(context.Background(), ids...); err != nil {
			log.Printf("[gripmock] failed to persist delete by id: %v", err)

			return 0
		}
	}

	return b.searcher.del(ids...)
}

// DeleteSession deletes all stubs that belong to the provided session.
// Empty session is treated as global and is not deleted by this method.
func (b *Budgerigar) DeleteSession(session string) int {
	if session == "" {
		return 0
	}

	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	if b.persistent != nil {
		if _, err := b.persistent.DeleteSession(context.Background(), session); err != nil {
			log.Printf("[gripmock] failed to persist delete by session: %v", err)

			return 0
		}
	}

	all := b.searcher.all()
	ids := make([]uuid.UUID, 0, len(all))

	for _, stub := range all {
		if stub.Session == session {
			ids = append(ids, stub.ID)
		}
	}

	if len(ids) == 0 {
		return 0
	}

	return b.searcher.del(ids...)
}

// FindByID retrieves the Stub value associated with the given ID.
func (b *Budgerigar) FindByID(id uuid.UUID) *Stub {
	return b.searcher.findByID(id)
}

// FindByQuery retrieves the Stub value associated with the given Query.
func (b *Budgerigar) FindByQuery(query Query) (*Result, error) {
	return b.searcher.find(query)
}

// FindByQueryBidi retrieves a BidiResult for bidirectional streaming.
func (b *Budgerigar) FindByQueryBidi(query QueryBidi) (*BidiResult, error) {
	return b.searcher.findBidi(query)
}

// FindBy retrieves all Stub values that match the given service and method
// from the Budgerigar's searcher, sorted by priority score in descending order.
func (b *Budgerigar) FindBy(service, method string) ([]*Stub, error) {
	return b.searcher.findBy(service, method)
}

// All returns all Stub values.
func (b *Budgerigar) All() []*Stub {
	stubs := b.searcher.all()
	if stubs == nil {
		return []*Stub{}
	}

	return stubs
}

// Used returns all Stub values that have been used.
func (b *Budgerigar) Used() []*Stub {
	stubs := b.searcher.used()
	if stubs == nil {
		return []*Stub{}
	}

	return stubs
}

// Unused returns all Stub values that have not been used.
func (b *Budgerigar) Unused() []*Stub {
	stubs := b.searcher.unused()
	if stubs == nil {
		return []*Stub{}
	}

	return stubs
}

// Sessions returns sorted non-empty session IDs known by storage.
func (b *Budgerigar) Sessions() []string {
	return b.searcher.sessions()
}

// Clear removes all Stub values.
func (b *Budgerigar) Clear() {
	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	if b.persistent != nil {
		if err := b.persistent.Clear(context.Background()); err != nil {
			log.Printf("[gripmock] failed to clear persistent stubs: %v", err)

			return
		}
	}

	b.searcher.clear()
}

func dedupeStubsByID(values []*Stub) []*Stub {
	if len(values) == 0 {
		return values
	}

	ordered := make([]*Stub, 0, len(values))
	seen := make(map[uuid.UUID]int, len(values))

	for _, value := range values {
		idx, ok := seen[value.ID]
		if ok {
			ordered[idx] = value

			continue
		}

		seen[value.ID] = len(ordered)
		ordered = append(ordered, value)
	}

	return ordered
}

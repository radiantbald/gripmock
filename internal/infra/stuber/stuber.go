package stuber

import (
	"context"
	"errors"
	healthgrpc "google.golang.org/grpc/health/grpc_health_v1"
	"log"
	"strings"
	"sync"
	"sync/atomic"
)

type Aliveness interface {
	SetAlive()
}

type Budgerigar struct {
	searcher       *searcher
	persistent     PersistentStore
	persistentLock sync.Mutex
	stateLock      sync.RWMutex
	nextID         atomic.Uint64
	roomEnabled    map[string]map[uint64]bool
}

func NewBudgerigar() *Budgerigar {
	b := &Budgerigar{
		roomEnabled: make(map[string]map[uint64]bool),
	}
	b.searcher = newSearcherWithOptions(searcherOptions{
		enabledForRoom: b.isEnabledForRoom,
	})

	return b
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

	roomState, err := b.persistent.LoadRoomState(ctx)
	if err != nil {
		return err
	}
	b.replaceRoomState(roomState)

	related := b.ensureSingleEnabledByRoute(all...)
	candidates := dedupeStubsByID(append(all, related...))

	if len(related) > 0 {
		if _, err := b.persistent.UpsertMany(ctx, candidates...); err != nil {
			return err
		}
	}

	b.searcher.clear()
	if len(candidates) > 0 {
		b.refreshNextID(candidates...)
		b.searcher.upsert(candidates...)
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

// PutMany inserts the given Stub values. Assigns numeric IDs to stubs without IDs.
func (b *Budgerigar) PutMany(values ...*Stub) []uint64 {
	b.refreshNextID(values...)

	for _, value := range values {
		if value.ID == 0 {
			value.ID = b.nextID.Add(1)
		}
	}

	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	related := b.ensureSingleEnabledByRoute(values...)
	candidates := dedupeStubsByID(append(values, related...))
	b.refreshNextID(candidates...)

	if b.persistent != nil {
		if _, err := b.persistent.UpsertMany(context.Background(), candidates...); err != nil {
			log.Printf("[gripmock] failed to persist stubs: %v", err)

			return []uint64{}
		}
	}

	b.searcher.upsert(candidates...)

	ids := make([]uint64, len(values))
	for i, value := range values {
		ids[i] = value.ID
	}

	return ids
}

// UpdateMany updates stubs that have non-nil IDs.
func (b *Budgerigar) UpdateMany(values ...*Stub) []uint64 {
	updates := make([]*Stub, 0, len(values))

	for _, value := range values {
		if value.ID != 0 {
			updates = append(updates, value)
		}
	}

	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	related := b.ensureSingleEnabledByRoute(updates...)
	candidates := dedupeStubsByID(append(updates, related...))
	b.refreshNextID(candidates...)

	if b.persistent != nil {
		if _, err := b.persistent.UpsertMany(context.Background(), candidates...); err != nil {
			log.Printf("[gripmock] failed to persist updated stubs: %v", err)

			return []uint64{}
		}
	}

	b.searcher.upsert(candidates...)

	ids := make([]uint64, len(updates))
	for i, value := range updates {
		ids[i] = value.ID
	}

	return ids
}

func (b *Budgerigar) SetRoomEnabled(room string, id uint64, enabled bool) error {
	room = strings.TrimSpace(room)
	if room == "" {
		return errors.New("room is required")
	}

	target := b.searcher.findByID(id)
	if target == nil {
		return ErrStubNotFound
	}

	updates := []RoomEnabledState{{
		StubID:  id,
		Room:    room,
		Enabled: enabled,
	}}

	if enabled {
		for _, existing := range b.searcher.all() {
			if existing.ID == target.ID || !sameEnabledRoute(existing, target) {
				continue
			}
			if !b.stubEnabledForSpecificRoom(existing.ID, room) {
				continue
			}

			updates = append(updates, RoomEnabledState{
				StubID:  existing.ID,
				Room:    room,
				Enabled: false,
			})
		}
	}

	b.applyRoomState(updates)

	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()
	if b.persistent != nil {
		if err := b.persistent.UpsertRoomState(context.Background(), updates...); err != nil {
			return err
		}
	}

	return nil
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

	leftRoom := strings.TrimSpace(left.Room)
	rightRoom := strings.TrimSpace(right.Room)
	if leftRoom != "" && rightRoom != "" && leftRoom != rightRoom {
		return false
	}

	return sameServiceAlias(left.Service, right.Service)
}

func (b *Budgerigar) isEnabledForRoom(stub *Stub, room string) bool {
	room = strings.TrimSpace(room)
	if room == "" {
		if enabled, ok := b.stubEnabledForAnyRoom(stub.ID); ok {
			return enabled
		}

		return stub.IsEnabled()
	}

	if enabled, ok := b.stubEnabledForRoomState(stub.ID, room); ok {
		return enabled
	}

	// New room defaults to "all stubs disabled" until explicitly enabled per-room.
	return false
}

func (b *Budgerigar) stubEnabledForSpecificRoom(stubID uint64, room string) bool {
	enabled, ok := b.stubEnabledForRoomState(stubID, room)
	if !ok {
		return false
	}

	return enabled
}

func (b *Budgerigar) stubEnabledForRoomState(stubID uint64, room string) (bool, bool) {
	b.stateLock.RLock()
	defer b.stateLock.RUnlock()

	byRoom, ok := b.roomEnabled[room]
	if !ok {
		return false, false
	}

	enabled, ok := byRoom[stubID]
	return enabled, ok
}

func (b *Budgerigar) stubEnabledForAnyRoom(stubID uint64) (bool, bool) {
	b.stateLock.RLock()
	defer b.stateLock.RUnlock()

	seen := false
	for _, byRoom := range b.roomEnabled {
		enabled, ok := byRoom[stubID]
		if !ok {
			continue
		}
		seen = true
		if enabled {
			return true, true
		}
	}

	return false, seen
}

func (b *Budgerigar) replaceRoomState(values []RoomEnabledState) {
	next := make(map[string]map[uint64]bool)
	for _, item := range values {
		room := strings.TrimSpace(item.Room)
		if room == "" || !item.Enabled {
			continue
		}
		if next[room] == nil {
			next[room] = make(map[uint64]bool)
		}
		next[room][item.StubID] = true
	}

	b.stateLock.Lock()
	b.roomEnabled = next
	b.stateLock.Unlock()
}

func (b *Budgerigar) applyRoomState(values []RoomEnabledState) {
	b.stateLock.Lock()
	defer b.stateLock.Unlock()

	for _, item := range values {
		room := strings.TrimSpace(item.Room)
		if room == "" {
			continue
		}
		if b.roomEnabled[room] == nil {
			b.roomEnabled[room] = make(map[uint64]bool)
		}
		if item.Enabled {
			b.roomEnabled[room][item.StubID] = true
			continue
		}

		delete(b.roomEnabled[room], item.StubID)
		if len(b.roomEnabled[room]) == 0 {
			delete(b.roomEnabled, room)
		}
	}
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
func (b *Budgerigar) DeleteByID(ids ...uint64) int {
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

// DeleteRoom deletes all stubs that belong to the provided room.
// Empty room is treated as global and is not deleted by this method.
func (b *Budgerigar) DeleteRoom(room string) int {
	if room == "" {
		return 0
	}

	b.persistentLock.Lock()
	defer b.persistentLock.Unlock()

	if b.persistent != nil {
		if _, err := b.persistent.DeleteRoom(context.Background(), room); err != nil {
			log.Printf("[gripmock] failed to persist delete by room: %v", err)

			return 0
		}
	}

	b.stateLock.Lock()
	idsByRoom := b.roomEnabled[room]
	delete(b.roomEnabled, room)
	b.stateLock.Unlock()

	if len(idsByRoom) == 0 {
		return 0
	}

	ids := make([]uint64, 0, len(idsByRoom))
	for id := range idsByRoom {
		ids = append(ids, id)
	}

	return b.searcher.del(ids...)
}

// FindByID retrieves the Stub value associated with the given ID.
func (b *Budgerigar) FindByID(id uint64) *Stub {
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

// Rooms returns sorted non-empty room IDs known by storage.
func (b *Budgerigar) Rooms() []string {
	return b.searcher.rooms()
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

	b.stateLock.Lock()
	b.roomEnabled = make(map[string]map[uint64]bool)
	b.stateLock.Unlock()

	b.searcher.clear()
}

func dedupeStubsByID(values []*Stub) []*Stub {
	if len(values) == 0 {
		return values
	}

	ordered := make([]*Stub, 0, len(values))
	seen := make(map[uint64]int, len(values))

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

func (b *Budgerigar) refreshNextID(values ...*Stub) {
	var maxID uint64
	for _, value := range values {
		if value != nil && value.ID > maxID {
			maxID = value.ID
		}
	}

	for {
		current := b.nextID.Load()
		if maxID <= current {
			return
		}
		if b.nextID.CompareAndSwap(current, maxID) {
			return
		}
	}
}

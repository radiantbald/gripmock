package room

import (
	"slices"
	"strings"
	"sync"
	"time"
)

const deletedRoomKickWindow = 15 * time.Second

type Tracker struct {
	mu           sync.RWMutex
	lastSeen     map[string]time.Time
	blockedUntil map[string]time.Time
	owners       map[string]string
	clientRoutes map[string]string
}

func NewTracker() *Tracker {
	return &Tracker{
		lastSeen:     make(map[string]time.Time),
		blockedUntil: make(map[string]time.Time),
		owners:       make(map[string]string),
		clientRoutes: make(map[string]string),
	}
}

func (t *Tracker) Touch(roomID string, at time.Time) {
	t.TouchWithOwner(roomID, "", at)
}

func (t *Tracker) TouchWithOwner(roomID string, ownerID string, at time.Time) {
	if roomID == "" {
		return
	}

	ownerID = trimOwner(ownerID)

	t.mu.Lock()
	if until, ok := t.blockedUntil[roomID]; ok {
		if at.Before(until) {
			t.mu.Unlock()

			return
		}

		delete(t.blockedUntil, roomID)
	}

	if ownerID != "" {
		if _, exists := t.owners[roomID]; !exists {
			t.owners[roomID] = ownerID
		}
	}

	t.lastSeen[roomID] = at
	t.mu.Unlock()
}

func (t *Tracker) Forget(roomID string) {
	if roomID == "" {
		return
	}

	t.mu.Lock()
	delete(t.lastSeen, roomID)
	delete(t.owners, roomID)
	for clientID, mappedRoomID := range t.clientRoutes {
		if mappedRoomID == roomID {
			delete(t.clientRoutes, clientID)
		}
	}
	t.blockedUntil[roomID] = time.Now().Add(deletedRoomKickWindow)
	t.mu.Unlock()
}

func (t *Tracker) CanDelete(roomID string, ownerID string) bool {
	if roomID == "" {
		return false
	}

	ownerID = trimOwner(ownerID)
	if ownerID == "" {
		return false
	}

	t.mu.RLock()
	defer t.mu.RUnlock()

	currentOwner, ok := t.owners[roomID]
	if !ok {
		return false
	}

	return currentOwner == ownerID
}

func (t *Tracker) IsForgotten(roomID string, at time.Time) bool {
	if roomID == "" {
		return false
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	until, ok := t.blockedUntil[roomID]
	if !ok {
		return false
	}

	if at.Before(until) {
		return true
	}

	delete(t.blockedUntil, roomID)

	return false
}

func (t *Tracker) Expired(now time.Time, ttl time.Duration) []string {
	t.mu.RLock()
	defer t.mu.RUnlock()

	expired := make([]string, 0, len(t.lastSeen))
	for roomID, seenAt := range t.lastSeen {
		if ttl <= 0 || now.Sub(seenAt) >= ttl {
			expired = append(expired, roomID)
		}
	}

	slices.Sort(expired)

	return expired
}

func (t *Tracker) Rooms() []string {
	t.mu.RLock()
	defer t.mu.RUnlock()

	rooms := make([]string, 0, len(t.lastSeen))
	for roomID := range t.lastSeen {
		if roomID == "" {
			continue
		}

		rooms = append(rooms, roomID)
	}

	slices.Sort(rooms)

	return rooms
}

func (t *Tracker) AssignClient(clientID string, roomID string) bool {
	clientID = strings.TrimSpace(clientID)
	roomID = strings.TrimSpace(roomID)
	if clientID == "" || roomID == "" {
		return false
	}

	t.mu.Lock()
	t.clientRoutes[clientID] = roomID
	t.mu.Unlock()

	return true
}

func (t *Tracker) RoomByClient(clientID string) string {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return ""
	}

	t.mu.RLock()
	roomID := strings.TrimSpace(t.clientRoutes[clientID])
	t.mu.RUnlock()

	return roomID
}

func (t *Tracker) UnassignClient(clientID string) bool {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return false
	}

	t.mu.Lock()
	_, existed := t.clientRoutes[clientID]
	delete(t.clientRoutes, clientID)
	t.mu.Unlock()

	return existed
}

//nolint:gochecknoglobals
var defaultTracker = NewTracker()

func Touch(roomID string) {
	defaultTracker.Touch(roomID, time.Now())
}

func Forget(roomID string) {
	defaultTracker.Forget(roomID)
}

func Expired(now time.Time, ttl time.Duration) []string {
	return defaultTracker.Expired(now, ttl)
}

func Rooms() []string {
	return defaultTracker.Rooms()
}

func IsForgotten(roomID string) bool {
	return defaultTracker.IsForgotten(roomID, time.Now())
}

func TouchWithOwner(roomID string, ownerID string) {
	defaultTracker.TouchWithOwner(roomID, ownerID, time.Now())
}

func CanDelete(roomID string, ownerID string) bool {
	return defaultTracker.CanDelete(roomID, ownerID)
}

func AssignClient(clientID string, roomID string) bool {
	return defaultTracker.AssignClient(clientID, roomID)
}

func RoomByClient(clientID string) string {
	return defaultTracker.RoomByClient(clientID)
}

func UnassignClient(clientID string) bool {
	return defaultTracker.UnassignClient(clientID)
}

func trimOwner(ownerID string) string {
	return strings.TrimSpace(ownerID)
}

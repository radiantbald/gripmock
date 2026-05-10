package session

import (
	"slices"
	"strings"
	"sync"
	"time"
)

const deletedSessionKickWindow = 15 * time.Second

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

func (t *Tracker) Touch(sessionID string, at time.Time) {
	t.TouchWithOwner(sessionID, "", at)
}

func (t *Tracker) TouchWithOwner(sessionID string, ownerID string, at time.Time) {
	if sessionID == "" {
		return
	}

	ownerID = trimOwner(ownerID)

	t.mu.Lock()
	if until, ok := t.blockedUntil[sessionID]; ok {
		if at.Before(until) {
			t.mu.Unlock()

			return
		}

		delete(t.blockedUntil, sessionID)
	}

	if ownerID != "" {
		if _, exists := t.owners[sessionID]; !exists {
			t.owners[sessionID] = ownerID
		}
	}

	t.lastSeen[sessionID] = at
	t.mu.Unlock()
}

func (t *Tracker) Forget(sessionID string) {
	if sessionID == "" {
		return
	}

	t.mu.Lock()
	delete(t.lastSeen, sessionID)
	delete(t.owners, sessionID)
	for clientID, mappedSessionID := range t.clientRoutes {
		if mappedSessionID == sessionID {
			delete(t.clientRoutes, clientID)
		}
	}
	t.blockedUntil[sessionID] = time.Now().Add(deletedSessionKickWindow)
	t.mu.Unlock()
}

func (t *Tracker) CanDelete(sessionID string, ownerID string) bool {
	if sessionID == "" {
		return false
	}

	ownerID = trimOwner(ownerID)
	if ownerID == "" {
		return false
	}

	t.mu.RLock()
	defer t.mu.RUnlock()

	currentOwner, ok := t.owners[sessionID]
	if !ok {
		return false
	}

	return currentOwner == ownerID
}

func (t *Tracker) IsForgotten(sessionID string, at time.Time) bool {
	if sessionID == "" {
		return false
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	until, ok := t.blockedUntil[sessionID]
	if !ok {
		return false
	}

	if at.Before(until) {
		return true
	}

	delete(t.blockedUntil, sessionID)

	return false
}

func (t *Tracker) Expired(now time.Time, ttl time.Duration) []string {
	t.mu.RLock()
	defer t.mu.RUnlock()

	expired := make([]string, 0, len(t.lastSeen))
	for sessionID, seenAt := range t.lastSeen {
		if ttl <= 0 || now.Sub(seenAt) >= ttl {
			expired = append(expired, sessionID)
		}
	}

	slices.Sort(expired)

	return expired
}

func (t *Tracker) Sessions() []string {
	t.mu.RLock()
	defer t.mu.RUnlock()

	sessions := make([]string, 0, len(t.lastSeen))
	for sessionID := range t.lastSeen {
		if sessionID == "" {
			continue
		}

		sessions = append(sessions, sessionID)
	}

	slices.Sort(sessions)

	return sessions
}

func (t *Tracker) AssignClient(clientID string, sessionID string) bool {
	clientID = strings.TrimSpace(clientID)
	sessionID = strings.TrimSpace(sessionID)
	if clientID == "" || sessionID == "" {
		return false
	}

	t.mu.Lock()
	t.clientRoutes[clientID] = sessionID
	t.mu.Unlock()

	return true
}

func (t *Tracker) SessionByClient(clientID string) string {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return ""
	}

	t.mu.RLock()
	sessionID := strings.TrimSpace(t.clientRoutes[clientID])
	t.mu.RUnlock()

	return sessionID
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

func Touch(sessionID string) {
	defaultTracker.Touch(sessionID, time.Now())
}

func Forget(sessionID string) {
	defaultTracker.Forget(sessionID)
}

func Expired(now time.Time, ttl time.Duration) []string {
	return defaultTracker.Expired(now, ttl)
}

func Sessions() []string {
	return defaultTracker.Sessions()
}

func IsForgotten(sessionID string) bool {
	return defaultTracker.IsForgotten(sessionID, time.Now())
}

func TouchWithOwner(sessionID string, ownerID string) {
	defaultTracker.TouchWithOwner(sessionID, ownerID, time.Now())
}

func CanDelete(sessionID string, ownerID string) bool {
	return defaultTracker.CanDelete(sessionID, ownerID)
}

func AssignClient(clientID string, sessionID string) bool {
	return defaultTracker.AssignClient(clientID, sessionID)
}

func SessionByClient(clientID string) string {
	return defaultTracker.SessionByClient(clientID)
}

func UnassignClient(clientID string) bool {
	return defaultTracker.UnassignClient(clientID)
}

func trimOwner(ownerID string) string {
	return strings.TrimSpace(ownerID)
}

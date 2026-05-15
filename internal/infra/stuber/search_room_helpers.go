package stuber

import (
	"iter"

	"github.com/google/uuid"
)

func (s *searcher) collectUsedIDs() map[uuid.UUID]struct{} {
	usedIDs := make(map[uuid.UUID]struct{}, len(s.stubCallCount))

	for key, n := range s.stubCallCount {
		if n > 0 {
			usedIDs[key.id] = struct{}{}
		}
	}

	return usedIDs
}

func (s *searcher) isVisibleAndNotExhausted(stub *Stub, room string) bool {
	if !isStubVisibleForRoom(stub.Room, room) {
		return false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.notExhausted(stub, room)
}

// filterExhaustedStubs removes stubs that have reached their Times limit for the given room.
func (s *searcher) filterExhaustedStubs(stubs []*Stub, room string) []*Stub {
	s.mu.RLock()
	defer s.mu.RUnlock()

	filtered := stubs[:0]
	for _, stub := range stubs {
		if s.notExhausted(stub, room) {
			filtered = append(filtered, stub)
		}
	}

	return filtered
}

func (s *searcher) filterNotExhaustedSeq(seq iter.Seq[*Stub], room string) iter.Seq[*Stub] {
	return func(yield func(*Stub) bool) {
		s.mu.RLock()
		defer s.mu.RUnlock()

		for stub := range seq {
			if s.notExhausted(stub, room) {
				if !yield(stub) {
					return
				}
			}
		}
	}
}

func (s *searcher) notExhausted(stub *Stub, room string) bool {
	times := stub.EffectiveTimes()
	if times <= 0 {
		return true
	}

	key := callCountKey{id: stub.ID, room: room}

	return s.stubCallCount[key] < times
}

// filterByRoom returns stubs visible for the given room.
// Room empty: only global stubs (stub.Room == "").
// Room non-empty: global stubs + stubs for that room.
func filterByRoom(stubs []*Stub, room string) []*Stub {
	filtered := stubs[:0]
	for _, stub := range stubs {
		if isStubVisibleForRoom(stub.Room, room) {
			filtered = append(filtered, stub)
		}
	}

	return filtered
}

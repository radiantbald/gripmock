package stuber

import (
	"errors"
	"iter"
)

// storageWithInternal wraps external storage and dedicated internal storage.
// Internal stubs are stored separately with special handling:
// - Internal stubs are queried first in matching
// - Internal stubs are hidden from user-facing APIs (All, Used, Unused, etc.)
type storageWithInternal struct {
	*storage

	internalBase *storage
	internal     InternalStubStorage
}

// newStorageWithInternal creates a storage that supports internal stubs.
// It automatically initializes internal gripmock health stubs with NOT_SERVING status.
func newStorageWithInternal() *storageWithInternal {
	external := newStorage()
	internal := newStorage()

	storageWithInternal := &storageWithInternal{
		storage:      external,
		internalBase: internal,
		internal:     newInternalStorageAdapter(internal),
	}

	// Initialize internal gripmock health stubs with NOT_SERVING
	SetupGripmockHealthStubs(storageWithInternal.internal)

	return storageWithInternal
}

// Internal returns the internal storage interface for adding/managing internal stubs.
//
//nolint:ireturn
func (s *storageWithInternal) Internal() InternalStubStorage {
	return s.internal
}

// findAllAvailable wraps to include internal stubs.
func (s *storageWithInternal) findAllAvailable(service, method, room string) (iter.Seq[*Stub], error) {
	internalSeq, internalErr := s.internal.FindAllAvailable(service, method, room)
	if internalErr != nil && !shouldIgnoreInternalLookupErr(internalErr) {
		return nil, internalErr
	}

	if internalErr != nil {
		internalSeq = nil
	}

	externalSeq, externalErr := s.storage.findAllAvailable(service, method, room)
	if externalErr != nil && internalSeq == nil {
		return nil, externalErr
	}

	if externalErr != nil {
		externalSeq = nil
	}

	return chainSeq(internalSeq, externalSeq), nil
}

func shouldIgnoreInternalLookupErr(err error) bool {
	return errors.Is(err, ErrLeftNotFound) || errors.Is(err, ErrRightNotFound)
}

func chainSeq(first, second iter.Seq[*Stub]) iter.Seq[*Stub] {
	return func(yield func(*Stub) bool) {
		if !yieldSeq(first, yield) {
			return
		}

		yieldSeq(second, yield)
	}
}

func yieldSeq(seq iter.Seq[*Stub], yield func(*Stub) bool) bool {
	if seq == nil {
		return true
	}

	for stub := range seq {
		if !yield(stub) {
			return false
		}
	}

	return true
}

// findByMethodAvailable wraps to include internal stubs.
func (s *storageWithInternal) findByMethodAvailable(method, room string) iter.Seq[*Stub] {
	return func(yield func(*Stub) bool) {
		// First yield internal stubs
		for stub := range s.internal.FindByMethodAvailable(method, room) {
			if !yield(stub) {
				return
			}
		}
		// Then yield external stubs
		for stub := range s.storage.findByMethodAvailable(method, room) {
			if !yield(stub) {
				return
			}
		}
	}
}

// hasMethodAvailable checks internal + external.
func (s *storageWithInternal) hasMethodAvailable(method, room string) bool {
	if s.internal.HasMethodAvailable(method, room) {
		return true
	}

	return s.storage.hasMethodAvailable(method, room)
}

// findByID returns stub by ID from external storage only.
// Internal stubs are hidden from direct ID lookup to prevent collisions with user stubs.
func (s *storageWithInternal) findByID(id uint64) *Stub {
	return s.storage.findByID(id)
}

// values returns only external stubs (internal hidden from API).
func (s *storageWithInternal) values() iter.Seq[*Stub] {
	return s.storage.values()
}

// roomsList returns only external rooms.
func (s *storageWithInternal) roomsList() []string {
	return s.storage.roomsList()
}

// clear clears both storage and internal storage.
func (s *storageWithInternal) clear() {
	s.storage.clear()
	s.internalBase.clear()
}

// findByIDs returns stubs by IDs from storage.
func (s *storageWithInternal) findByIDs(ids iter.Seq[uint64]) iter.Seq[*Stub] {
	return s.storage.findByIDs(ids)
}

// posByPN returns position by service/method from storage.
func (s *storageWithInternal) posByPN(left, right string) ([]uint64, error) {
	return s.storage.posByPN(left, right)
}

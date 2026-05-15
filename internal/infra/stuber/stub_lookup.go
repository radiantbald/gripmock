package stuber

import (
	"iter"
)

type idLookup interface {
	LookupID(id uint64) *Stub
}

type serviceLookup interface {
	LookupServiceAvailable(service, method string) (iter.Seq[*Stub], error)
}

type methodLookup interface {
	HasMethodAvailable(method string) bool
	LookupMethodAvailable(method string) iter.Seq[*Stub]
}

type stubLookup interface {
	idLookup
	serviceLookup
	methodLookup
}

type searcherIDLookup struct {
	searcher *searcher
}

type searcherRoomFallbackServiceLookup struct {
	searcher *searcher
	room     string
}

type searcherRoomFallbackMethodLookup struct {
	searcher *searcher
	room     string
}

type searcherLookupProvider interface {
	build(s *searcher, room string) *searcherLookup
}

type searcherLookupFactory struct {
	newID      func(*searcher) idLookup
	newService func(*searcher, string) serviceLookup
	newMethod  func(*searcher, string) methodLookup
}

type searcherLookup struct {
	id      idLookup
	service serviceLookup
	method  methodLookup
}

var (
	_ stubLookup    = (*searcherLookup)(nil)
	_ idLookup      = (*searcherIDLookup)(nil)
	_ serviceLookup = (*searcherRoomFallbackServiceLookup)(nil)
	_ methodLookup  = (*searcherRoomFallbackMethodLookup)(nil)
)

func (s *searcher) lookup(room string) *searcherLookup {
	s.lookupMu.RLock()
	lookup, ok := s.lookupCache[room]
	s.lookupMu.RUnlock()

	if ok {
		return lookup
	}

	s.lookupMu.Lock()
	defer s.lookupMu.Unlock()

	if lookup, ok = s.lookupCache[room]; ok {
		return lookup
	}

	lookup = s.lookupProvider.build(s, room)
	s.lookupCache[room] = lookup

	return lookup
}

func defaultSearcherLookupFactory() searcherLookupFactory {
	return searcherLookupFactory{
		newID: func(s *searcher) idLookup {
			return &searcherIDLookup{searcher: s}
		},
		newService: func(s *searcher, room string) serviceLookup {
			return &searcherRoomFallbackServiceLookup{
				searcher: s,
				room:     room,
			}
		},
		newMethod: func(s *searcher, room string) methodLookup {
			return &searcherRoomFallbackMethodLookup{
				searcher: s,
				room:     room,
			}
		},
	}
}

func (f searcherLookupFactory) build(s *searcher, room string) *searcherLookup {
	return &searcherLookup{
		id:      f.newID(s),
		service: f.newService(s, room),
		method:  f.newMethod(s, room),
	}
}

func (l *searcherIDLookup) LookupID(id uint64) *Stub {
	return l.searcher.findByID(id)
}

func (l *searcherRoomFallbackServiceLookup) LookupServiceAvailable(service, method string) (iter.Seq[*Stub], error) {
	seq, err := l.searcher.storage.findAllAvailable(service, method, l.room)
	if err != nil {
		return nil, err
	}

	return l.searcher.filterNotExhaustedSeq(seq, l.room), nil
}

func (l *searcherRoomFallbackMethodLookup) LookupMethodAvailable(method string) iter.Seq[*Stub] {
	if !l.searcher.storage.hasMethodAvailable(method, l.room) {
		return func(func(*Stub) bool) {}
	}

	return l.searcher.filterNotExhaustedSeq(l.searcher.storage.findByMethodAvailable(method, l.room), l.room)
}

func (l *searcherRoomFallbackMethodLookup) HasMethodAvailable(method string) bool {
	return l.searcher.storage.hasMethodAvailable(method, l.room)
}

func (l *searcherLookup) LookupID(id uint64) *Stub {
	return l.id.LookupID(id)
}

func (l *searcherLookup) LookupServiceAvailable(service, method string) (iter.Seq[*Stub], error) {
	return l.service.LookupServiceAvailable(service, method)
}

func (l *searcherLookup) LookupMethodAvailable(method string) iter.Seq[*Stub] {
	return l.method.LookupMethodAvailable(method)
}

func (l *searcherLookup) HasMethodAvailable(method string) bool {
	return l.method.HasMethodAvailable(method)
}

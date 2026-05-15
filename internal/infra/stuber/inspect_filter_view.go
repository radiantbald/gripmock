package stuber

type regularLookupView struct {
	serviceMethod []*Stub
	roomFiltered  []*Stub
	timesFiltered []*Stub
}

func (s *searcher) buildRegularLookupView(query Query, all []*Stub) regularLookupView {
	serviceMethod := filterByServiceMethod(all, query.Service, query.Method)

	roomFiltered := filterByRoom(serviceMethod, query.Room)
	timesFiltered := s.filterExhaustedStubs(roomFiltered, query.Room)

	return regularLookupView{
		serviceMethod: serviceMethod,
		roomFiltered:  roomFiltered,
		timesFiltered: timesFiltered,
	}
}

func (v regularLookupView) hasFallback() bool {
	return len(v.serviceMethod) == 0
}

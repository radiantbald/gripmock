package stuber

type searcherOptions struct {
	lookupProvider  searcherLookupProvider
	lookupFactory   searcherLookupFactory
	processStrategy processStubsStrategy
	matcher         matchStrategy
	ranker          rankStrategy
	enabledForRoom  func(*Stub, string) bool
}

// newSearcher creates a new searcher instance.
func newSearcher() *searcher {
	return newSearcherWithOptions(searcherOptions{})
}

func newSearcherWithOptions(options searcherOptions) *searcher {
	lookupProvider := options.lookupProvider
	lookupFactory := options.lookupFactory

	if lookupProvider == nil && (lookupFactory.newID != nil || lookupFactory.newService != nil || lookupFactory.newMethod != nil) {
		lookupProvider = lookupFactory
	}

	if lookupProvider == nil {
		lookupProvider = defaultSearcherLookupFactory()
	}

	storage := newStorageWithInternal()

	s := &searcher{
		storage:         storage,
		internalStorage: storage.Internal(),
		stubCallCount:   make(map[callCountKey]int),
		lookupProvider:  lookupProvider,
		lookupCache:     make(map[string]*searcherLookup),
		enabledForRoom:  options.enabledForRoom,
	}

	if s.enabledForRoom == nil {
		s.enabledForRoom = func(stub *Stub, _ string) bool {
			return stub.IsEnabled()
		}
	}

	processStrategy := options.processStrategy
	if processStrategy == nil {
		processStrategy = newDefaultProcessStubsStrategy(s)
	}

	matcher := options.matcher
	if matcher == nil {
		matcher = newDefaultMatchStrategy(s)
	}

	ranker := options.ranker
	if ranker == nil {
		ranker = newDefaultRankStrategy(s)
	}

	s.processStrategy = processStrategy
	s.matcher = matcher
	s.ranker = ranker

	return s
}

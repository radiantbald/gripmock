package stuber_test

import "sync/atomic"

var stuberTestIDCounter atomic.Uint64

func newStubID() uint64 {
	return stuberTestIDCounter.Add(1)
}

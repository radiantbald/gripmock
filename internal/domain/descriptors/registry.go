package descriptors

import (
	"sort"
	"sync"

	"google.golang.org/protobuf/reflect/protoreflect"
)

// Registry holds descriptors added via REST API. Supports add and remove.
// GlobalFiles (startup descriptors) are separate; list operations merge both.
type Registry struct {
	mu      sync.RWMutex
	files   map[string]protoreflect.FileDescriptor // path -> file
	sources map[string]string                      // path -> source
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{
		files:   make(map[string]protoreflect.FileDescriptor),
		sources: make(map[string]string),
	}
}

// Register adds a file descriptor. Replaces if path exists.
func (r *Registry) Register(fd protoreflect.FileDescriptor) {
	r.RegisterWithSource(fd, "")
}

// RegisterWithSource adds a file descriptor and tracks its source.
func (r *Registry) RegisterWithSource(fd protoreflect.FileDescriptor, source string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.files[fd.Path()] = fd
	r.sources[fd.Path()] = source
}

// UnregisterByPath removes a file by path.
func (r *Registry) UnregisterByPath(path string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.files[path]; ok {
		delete(r.files, path)
		delete(r.sources, path)

		return true
	}

	return false
}

// UnregisterByService removes file(s) that contain the given service.
func (r *Registry) UnregisterByService(serviceID string) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	var removed int

	for path, fd := range r.files {
		services := fd.Services()

		for i := range services.Len() {
			if string(services.Get(i).FullName()) == serviceID {
				delete(r.files, path)
				delete(r.sources, path)

				removed++

				break
			}
		}
	}

	return removed
}

// RangeFiles calls f for each registered file.
func (r *Registry) RangeFiles(f func(protoreflect.FileDescriptor) bool) {
	r.mu.RLock()

	files := make([]protoreflect.FileDescriptor, 0, len(r.files))

	for _, fd := range r.files {
		files = append(files, fd)
	}

	r.mu.RUnlock()

	for _, fd := range files {
		if !f(fd) {
			return
		}
	}
}

// Paths returns all registered file paths.
func (r *Registry) Paths() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]string, 0, len(r.files))
	for p := range r.files {
		out = append(out, p)
	}

	sort.Strings(out)

	return out
}

// Source returns the source label associated with a registered file path.
func (r *Registry) Source(path string) string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.sources[path]
}

// ServiceIDs returns all service IDs (e.g. helloworld.Greeter) from registered files.
func (r *Registry) ServiceIDs() []string {
	r.mu.RLock()

	ids := make([]string, 0)

	for _, fd := range r.files {
		services := fd.Services()

		for i := range services.Len() {
			ids = append(ids, string(services.Get(i).FullName()))
		}
	}

	r.mu.RUnlock()

	sort.Strings(ids)

	return ids
}

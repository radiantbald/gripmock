package history

import (
	"encoding/json"
	"iter"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// CallRecord represents a single gRPC call made to the mock.
type CallRecord struct {
	CallID    string           `json:"callId,omitempty"`    // Stable call identifier for UI/sniffer.
	Transport string           `json:"transport,omitempty"` // Call source: mock/proxy.
	Client    string           `json:"client,omitempty"`    // Client identifier (e.g. gRPC user-agent).
	StubID    uuid.UUID        `json:"stubId,omitempty"`
	Service   string           `json:"service,omitempty"`
	Method    string           `json:"method,omitempty"`
	Session   string           `json:"session,omitempty"`   // Session ID (empty = global).
	Request   map[string]any   `json:"request,omitempty"`   // Deprecated: use Requests.
	Requests  []map[string]any `json:"requests,omitempty"`  // For streaming calls with multiple messages.
	Response  map[string]any   `json:"response,omitempty"`  // Deprecated: use Responses.
	Responses []map[string]any `json:"responses,omitempty"` // For streaming calls with multiple messages.
	// ResponseTimestamps contains per-response send time in server clock order.
	ResponseTimestamps []time.Time `json:"responseTimestamps,omitempty"`
	Code               uint32      `json:"code,omitempty"` // gRPC status code (e.g., codes.OK, codes.NotFound).
	Error              string      `json:"error,omitempty"`
	Timestamp          time.Time   `json:"timestamp"`
}

// Recorder records gRPC calls for inspection and verification.
type Recorder interface {
	Record(call CallRecord)
}

// FilterOpts specifies filter criteria for recorded calls.
// Empty string means "no filter" for that field.
// Session non-empty: records with Session=="" or Session==Session (visible to session).
type FilterOpts struct {
	Service string
	Method  string
	Session string
}

// Reader provides read access to recorded calls.
type Reader interface {
	All() []CallRecord
	Count() int
	Filter(opts FilterOpts) []CallRecord
	FilterByMethod(service, method string) []CallRecord
}

// Subscriber provides a stream of newly recorded calls.
type Subscriber interface {
	Subscribe(buffer int) (<-chan CallRecord, func())
}

// SessionCleaner removes records for a specific session.
type SessionCleaner interface {
	DeleteSession(session string) int
}

// MemoryStore implements both Recorder and Reader (in-memory).
// LimitBytes 0 means unlimited. MessageMaxBytes 0 means no truncation.
type MemoryStore struct {
	mu              sync.RWMutex
	calls           []CallRecord
	limitBytes      int64
	messageMaxBytes int64
	redactKeys      map[string]struct{} // lowercased keys to redact
	currentBytes    int64
	subscribers     map[uint64]chan CallRecord
	nextSubscriber  atomic.Uint64
}

// MemoryStoreOption configures MemoryStore.
type MemoryStoreOption func(*MemoryStore)

// WithMessageMaxBytes limits Request/Response size; excess is replaced with truncation marker.
func WithMessageMaxBytes(n int64) MemoryStoreOption {
	return func(s *MemoryStore) {
		s.messageMaxBytes = n
	}
}

// WithRedactKeys replaces values for matching keys (case-insensitive) with "[REDACTED]"
// in Request/Response. Keys are matched at any nesting level.
func WithRedactKeys(keys []string) MemoryStoreOption {
	m := make(map[string]struct{}, len(keys))
	for _, k := range keys {
		if k != "" {
			m[strings.ToLower(k)] = struct{}{}
		}
	}

	return func(s *MemoryStore) {
		s.redactKeys = m
	}
}

// NewMemoryStore creates a store with optional byte limit.
// limitBytes <= 0 means unlimited.
func NewMemoryStore(limitBytes int64, opts ...MemoryStoreOption) *MemoryStore {
	s := &MemoryStore{
		limitBytes:  limitBytes,
		subscribers: make(map[uint64]chan CallRecord),
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// Record implements Recorder.
func (s *MemoryStore) Record(call CallRecord) {
	if call.CallID == "" {
		call.CallID = uuid.NewString()
	}

	if call.Timestamp.IsZero() {
		call.Timestamp = time.Now()
	}

	if call.Transport == "" {
		call.Transport = "mock"
	}

	if len(s.redactKeys) > 0 {
		call = redactRecord(call, s.redactKeys)
	}

	if s.messageMaxBytes > 0 {
		call = truncateRecord(call, s.messageMaxBytes)
	}

	s.mu.Lock()

	sz := estimateRecordSize(call)
	s.calls = append(s.calls, call)
	s.currentBytes += sz

	for s.limitBytes > 0 && s.currentBytes > s.limitBytes && len(s.calls) > 1 {
		evicted := s.calls[0]
		s.calls = s.calls[1:]
		s.currentBytes -= estimateRecordSize(evicted)
	}

	subscribers := s.snapshotSubscribersLocked()
	s.mu.Unlock()

	notifySubscribers(subscribers, call)
}

const fallbackRecordSize = 1024

//nolint:gochecknoglobals
var truncatedMarker = map[string]any{"_truncated": true}

const redactedValue = "[REDACTED]"

func redactRecord(c CallRecord, keys map[string]struct{}) CallRecord {
	if c.Request != nil {
		c.Request = redactMap(c.Request, keys)
	}

	if len(c.Requests) > 0 {
		c.Requests = redactMessages(c.Requests, keys)
	}

	if c.Response != nil {
		c.Response = redactMap(c.Response, keys)
	}

	if len(c.Responses) > 0 {
		c.Responses = redactMessages(c.Responses, keys)
	}

	return c
}

func redactMessages(messages []map[string]any, keys map[string]struct{}) []map[string]any {
	out := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		out = append(out, redactMap(message, keys))
	}

	return out
}

func redactMap(m map[string]any, keys map[string]struct{}) map[string]any {
	if m == nil || len(keys) == 0 {
		return m
	}

	out := make(map[string]any, len(m))
	for k, v := range m {
		if _, ok := keys[strings.ToLower(k)]; ok {
			out[k] = redactedValue
		} else if sub, ok := asMap(v); ok {
			out[k] = redactMap(sub, keys)
		} else if arr := asSlice(v); arr != nil {
			out[k] = redactSlice(arr, keys)
		} else {
			out[k] = v
		}
	}

	return out
}

func redactSlice(arr []any, keys map[string]struct{}) []any {
	if arr == nil {
		return nil
	}

	out := make([]any, len(arr))
	for i, v := range arr {
		if sub, ok := asMap(v); ok {
			out[i] = redactMap(sub, keys)
		} else if subArr := asSlice(v); subArr != nil {
			out[i] = redactSlice(subArr, keys)
		} else {
			out[i] = v
		}
	}

	return out
}

func asMap(v any) (map[string]any, bool) {
	if v == nil {
		return nil, false
	}

	m, ok := v.(map[string]any)
	if ok {
		return m, true
	}

	return nil, false
}

func asSlice(v any) []any {
	if v == nil {
		return nil
	}

	arr, ok := v.([]any)
	if ok {
		return arr
	}

	return nil
}

func truncateRecord(c CallRecord, maxBytes int64) CallRecord {
	if c.Request != nil {
		if b, err := json.Marshal(c.Request); err == nil && int64(len(b)) > maxBytes {
			c.Request = truncatedMarker
		}
	}

	if len(c.Requests) > 0 {
		c.Requests = truncateMessages(c.Requests, maxBytes)
	}

	if c.Response != nil {
		if b, err := json.Marshal(c.Response); err == nil && int64(len(b)) > maxBytes {
			c.Response = truncatedMarker
		}
	}

	if len(c.Responses) > 0 {
		c.Responses = truncateMessages(c.Responses, maxBytes)
	}

	return c
}

func truncateMessages(messages []map[string]any, maxBytes int64) []map[string]any {
	out := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		if b, err := json.Marshal(message); err == nil && int64(len(b)) > maxBytes {
			out = append(out, truncatedMarker)
			continue
		}

		out = append(out, message)
	}

	return out
}

func estimateRecordSize(c CallRecord) int64 {
	b, err := json.Marshal(c)
	if err != nil {
		return fallbackRecordSize
	}

	return int64(len(b))
}

// All implements Reader.
func (s *MemoryStore) All() []CallRecord {
	return s.Filter(FilterOpts{})
}

// Count implements Reader.
func (s *MemoryStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return len(s.calls)
}

// Filter implements Reader. Single pass over calls with combined criteria.
func (s *MemoryStore) Filter(opts FilterOpts) []CallRecord {
	return slices.Collect(s.FilterSeq(opts))
}

// FilterSeq returns an iterator over records matching FilterOpts.
// Single pass, no intermediate allocations. Lock held during iteration.
func (s *MemoryStore) FilterSeq(opts FilterOpts) iter.Seq[CallRecord] {
	return func(yield func(CallRecord) bool) {
		s.mu.RLock()
		defer s.mu.RUnlock()

		for _, c := range s.calls {
			if opts.Service != "" && c.Service != opts.Service {
				continue
			}

			if opts.Method != "" && c.Method != opts.Method {
				continue
			}

			if opts.Session != "" && c.Session != "" && c.Session != opts.Session {
				continue
			}

			if !yield(c) {
				return
			}
		}
	}
}

// FilterByMethod implements Reader. Delegates to Filter for compatibility.
func (s *MemoryStore) FilterByMethod(service, method string) []CallRecord {
	return s.Filter(FilterOpts{Service: service, Method: method})
}

// DeleteSession removes records that belong strictly to the provided session.
// Global records (Session == "") are not affected.
func (s *MemoryStore) DeleteSession(session string) int {
	if session == "" {
		return 0
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	kept := s.calls[:0]
	deleted := 0

	var bytesAfter int64

	for _, c := range s.calls {
		if c.Session == session {
			deleted++

			continue
		}

		kept = append(kept, c)
		bytesAfter += estimateRecordSize(c)
	}

	s.calls = kept
	s.currentBytes = bytesAfter

	return deleted
}

func (s *MemoryStore) Subscribe(buffer int) (<-chan CallRecord, func()) {
	if buffer <= 0 {
		buffer = 1
	}

	ch := make(chan CallRecord, buffer)
	id := s.nextSubscriber.Add(1)

	s.mu.Lock()
	s.subscribers[id] = ch
	s.mu.Unlock()

	unsubscribe := func() {
		s.mu.Lock()
		defer s.mu.Unlock()

		existing, ok := s.subscribers[id]
		if !ok {
			return
		}

		delete(s.subscribers, id)
		close(existing)
	}

	return ch, unsubscribe
}

func (s *MemoryStore) snapshotSubscribersLocked() []chan CallRecord {
	if len(s.subscribers) == 0 {
		return nil
	}

	out := make([]chan CallRecord, 0, len(s.subscribers))
	for _, subscriber := range s.subscribers {
		out = append(out, subscriber)
	}

	return out
}

func notifySubscribers(subscribers []chan CallRecord, call CallRecord) {
	for _, subscriber := range subscribers {
		safePublish(subscriber, call)
	}
}

func safePublish(ch chan CallRecord, call CallRecord) {
	defer func() {
		_ = recover()
	}()

	select {
	case ch <- call:
	default:
	}
}

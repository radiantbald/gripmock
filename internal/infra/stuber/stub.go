package stuber

import (
	"encoding/binary"
	"fmt"

	"github.com/goccy/go-json"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"

	"github.com/bavix/gripmock/v3/internal/infra/types"
)

const (
	SourceFile  = "file"
	SourceRest  = "rest"
	SourceMCP   = "mcp"
	SourceProxy = "proxy"
)

func IsKnownSource(source string) bool {
	switch source {
	case SourceFile, SourceRest, SourceMCP, SourceProxy:
		return true
	default:
		return false
	}
}

// StubOptions holds optional behavior settings for a stub.
type StubOptions struct {
	Times int `json:"times,omitempty" validate:"gte=0"` // Max number of matches; 0 = unlimited.
}

// Stub represents a gRPC service method and its associated data.
type Stub struct {
	ID       uuid.UUID   `json:"id"`                                               // The unique identifier of the stub.
	Name     string      `json:"name,omitempty"`                                   // Optional user-defined stub name.
	Service  string      `json:"service"           validate:"required"`            // The name of the service.
	Method   string      `json:"method"            validate:"required"`            // The name of the method.
	Session  string      `json:"session,omitempty"`                                // Session ID for isolation (empty = global).
	Priority int         `json:"priority"`                                         // Deprecated: kept for backward compatibility.
	Enabled  *bool       `json:"enabled,omitempty"`                                // Enabled state (nil means enabled for compatibility).
	Options  StubOptions `json:"options,omitempty"`                                //nolint:modernize
	Headers  InputHeader `json:"headers"`                                          // The headers of the request.
	Input    InputData   `json:"input"             validate:"valid_input_config"`  // Unary input (mutually exclusive with Inputs).
	Inputs   []InputData `json:"inputs,omitempty"  validate:"valid_input_config"`  // Client streaming inputs (mutually exclusive with Input).
	Output   Output      `json:"output"            validate:"valid_output_config"` // The output data of the response.
	Effects  []Effect    `json:"effects,omitempty" validate:"valid_effects"`       // Side effects applied after a successful match.
	Source   string      `json:"source,omitempty"`                                 // Stub source.
}

// UnmarshalJSON supports legacy UUID IDs and numeric REST IDs.
func (s *Stub) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	rawID, hasID := raw["id"]
	delete(raw, "id")

	withoutID, err := json.Marshal(raw)
	if err != nil {
		return err
	}

	type alias Stub
	var decoded alias
	if err := json.Unmarshal(withoutID, &decoded); err != nil {
		return err
	}

	*s = Stub(decoded)
	if !hasID || len(rawID) == 0 || string(rawID) == "null" {
		return nil
	}

	var stringID string
	if err := json.Unmarshal(rawID, &stringID); err == nil {
		parsed, parseErr := uuid.Parse(stringID)
		if parseErr != nil {
			return parseErr
		}

		s.ID = parsed

		return nil
	}

	var numericID uint64
	if err := json.Unmarshal(rawID, &numericID); err == nil {
		s.ID = numericIDToUUID(numericID)

		return nil
	}

	return fmt.Errorf("id must be either uuid string or uint64 number")
}

func numericIDToUUID(value uint64) uuid.UUID {
	var id uuid.UUID
	binary.BigEndian.PutUint64(id[8:], value)

	return id
}

const (
	EffectActionUpsert = "upsert"
	EffectActionDelete = "delete"
)

// Effect represents a side effect executed after stub match.
type Effect struct {
	Action string         `json:"action"`
	ID     string         `json:"id,omitempty"`
	Stub   map[string]any `json:"stub,omitempty"`
}

// EffectiveTimes returns the stub's max match count; 0 means unlimited.
func (s *Stub) EffectiveTimes() int {
	return s.Options.Times
}

// IsUnary returns true if this stub is for unary requests (has Input data).
func (s *Stub) IsUnary() bool {
	return len(s.Inputs) == 0
}

// IsClientStream returns true if this stub is for client streaming requests (has Inputs data).
func (s *Stub) IsClientStream() bool {
	return len(s.Inputs) > 0
}

// IsServerStream returns true if this stub is for server streaming responses (has Output.Stream data).
func (s *Stub) IsServerStream() bool {
	return len(s.Output.Stream) > 0
}

// IsBidirectional returns true if this stub can handle bidirectional streaming.
// For bidirectional streaming, the stub should have Inputs data (for input matching) and Output.Stream data (for output).
func (s *Stub) IsBidirectional() bool {
	return s.IsClientStream() && s.IsServerStream()
}

// Key returns the unique identifier of the stub.
func (s *Stub) Key() uuid.UUID {
	return s.ID
}

// Left returns the service name of the stub.
func (s *Stub) Left() string {
	return s.Service
}

// Right returns the method name of the stub.
func (s *Stub) Right() string {
	return s.Method
}

// Score returns the priority score of the stub.
func (s *Stub) Score() int {
	return s.Priority
}

// IsEnabled returns whether stub can participate in matching.
// Nil is treated as enabled to preserve backward compatibility with old payloads.
func (s *Stub) IsEnabled() bool {
	return s.Enabled == nil || *s.Enabled
}

// SetEnabled updates enabled state and initializes pointer storage.
func (s *Stub) SetEnabled(enabled bool) {
	s.Enabled = &enabled
}

// InputData represents the input data of a gRPC request.
type InputData struct {
	IgnoreArrayOrder bool           `json:"ignoreArrayOrder,omitempty"` // Whether to ignore the order of arrays in the input data.
	Equals           map[string]any `json:"equals"`                     // The data to match exactly.
	Contains         map[string]any `json:"contains"`                   // The data to match partially.
	Matches          map[string]any `json:"matches"`                    // The data to match using regular expressions.
	Glob             map[string]any `json:"glob,omitempty"`             // The data to match using glob patterns.
	AnyOf            []AnyOfElement `json:"anyOf,omitempty"`            // Alternative matchers (OR logic).
}

// AnyOfElement is a flat alternative matcher inside InputData.
// Unlike InputData, it cannot nest further AnyOf — depth is limited to 1.
type AnyOfElement struct {
	IgnoreArrayOrder bool           `json:"ignoreArrayOrder,omitempty"`
	Equals           map[string]any `json:"equals"`
	Contains         map[string]any `json:"contains"`
	Matches          map[string]any `json:"matches"`
	Glob             map[string]any `json:"glob,omitempty"`
}

// GetEquals returns the data to match exactly.
func (i InputData) GetEquals() map[string]any {
	return i.Equals
}

// GetContains returns the data to match partially.
func (i InputData) GetContains() map[string]any {
	return i.Contains
}

// GetMatches returns the data to match using regular expressions.
func (i InputData) GetMatches() map[string]any {
	return i.Matches
}

// GetGlob returns the data to match using glob patterns.
func (i InputData) GetGlob() map[string]any {
	return i.Glob
}

// InputHeader represents the headers of a gRPC request.
type InputHeader struct {
	Equals   map[string]any       `json:"equals"`          // The headers to match exactly.
	Contains map[string]any       `json:"contains"`        // The headers to match partially.
	Matches  map[string]any       `json:"matches"`         // The headers to match using regular expressions.
	Glob     map[string]any       `json:"glob,omitempty"`  // The headers to match using glob patterns.
	AnyOf    []AnyOfHeaderElement `json:"anyOf,omitempty"` // Alternative matchers (OR logic).
}

// AnyOfHeaderElement is a flat alternative matcher inside InputHeader.
type AnyOfHeaderElement struct {
	Equals   map[string]any `json:"equals"`
	Contains map[string]any `json:"contains"`
	Matches  map[string]any `json:"matches"`
	Glob     map[string]any `json:"glob,omitempty"`
}

// GetEquals returns the headers to match exactly.
func (i InputHeader) GetEquals() map[string]any {
	return i.Equals
}

// GetContains returns the headers to match partially.
func (i InputHeader) GetContains() map[string]any {
	return i.Contains
}

// GetMatches returns the headers to match using regular expressions.
func (i InputHeader) GetMatches() map[string]any {
	return i.Matches
}

// GetGlob returns the headers to match using glob patterns.
func (i InputHeader) GetGlob() map[string]any {
	return i.Glob
}

// Len returns the total number of headers to match.
func (i InputHeader) Len() int {
	n := len(i.Equals) + len(i.Matches) + len(i.Contains) + len(i.Glob)

	for _, alt := range i.AnyOf {
		n += len(alt.Equals) + len(alt.Matches) + len(alt.Contains) + len(alt.Glob)
	}

	return n
}

// Output represents the output data of a gRPC response.
type Output struct {
	Headers map[string]string `json:"headers"`          // The headers of the response.
	Data    map[string]any    `json:"data,omitempty"`   // The data of the response.
	Stream  []any             `json:"stream,omitempty"` // The stream data for server-side streaming.
	// Each element represents a message to be sent.
	Error   string           `json:"error"`             // The error message of the response.
	Code    *codes.Code      `json:"code,omitempty"`    // The status code of the response.
	Details []map[string]any `json:"details,omitempty"` // gRPC error details (google.protobuf.Any payloads).
	Delay   types.Duration   `json:"delay,omitempty"`   // The delay of the response or error.
}

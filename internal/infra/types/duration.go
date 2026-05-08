// Package types provides custom JSON types for Gripmock.
package types

import (
	"encoding/json"
	"time"
)

// Duration is a custom type alias for time.Duration that provides
// JSON marshaling/unmarshaling support for numeric millisecond values.
type Duration time.Duration

// UnmarshalJSON implements json.Unmarshaler interface.
func (d *Duration) UnmarshalJSON(data []byte) error {
	var numeric float64
	if err := json.Unmarshal(data, &numeric); err != nil {
		return err
	}

	*d = Duration(time.Duration(numeric * float64(time.Millisecond)))

	return nil
}

// MarshalJSON implements json.Marshaler interface.
func (d Duration) MarshalJSON() ([]byte, error) {
	milliseconds := float64(time.Duration(d)) / float64(time.Millisecond)
	return json.Marshal(milliseconds)
}

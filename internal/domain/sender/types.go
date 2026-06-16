package sender

import "time"

const (
	SchemaSourceProto      = "proto"
	SchemaSourceReflection = "reflection"
)

type Collection struct {
	ID          int64
	Name        string
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Request struct {
	ID           int64
	CollectionID int64
	Name         string
	TargetHost   string
	Service      string
	Method       string
	SchemaSource string
	Metadata     map[string]string
	Payload      map[string]any
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

package muxmiddleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/bavix/gripmock/v3/internal/infra/room"
)

const (
	HeaderName      = "X-Gripmock-Room"
	ResetHeaderName = "X-Gripmock-Room-Reset"
	OwnerHeaderName = "X-Gripmock-Client"
)

type contextKey struct{}
type ownerContextKey struct{}

// WithContext stores transport room in context for internal propagation.
func WithContext(ctx context.Context, roomID string) context.Context {
	if strings.TrimSpace(roomID) == "" {
		return ctx
	}

	return context.WithValue(ctx, contextKey{}, strings.TrimSpace(roomID))
}

// WithOwnerContext stores transport client identifier in context.
func WithOwnerContext(ctx context.Context, ownerID string) context.Context {
	if strings.TrimSpace(ownerID) == "" {
		return ctx
	}

	return context.WithValue(ctx, ownerContextKey{}, strings.TrimSpace(ownerID))
}

// ConsumeRequest moves room from transport header into request context and removes the header.
func ConsumeRequest(r *http.Request) *http.Request {
	consumed, _ := ConsumeRequestWithResetHint(r)

	return consumed
}

// ConsumeRequestWithResetHint returns consumed request and reset hint.
func ConsumeRequestWithResetHint(r *http.Request) (*http.Request, bool) {
	if r == nil {
		return nil, false
	}

	v := strings.TrimSpace(r.Header.Get(HeaderName))
	ownerID := strings.TrimSpace(r.Header.Get(OwnerHeaderName))
	reqWithOwner := r.WithContext(WithOwnerContext(r.Context(), ownerID))

	if v == "" {
		return reqWithOwner, false
	}

	if room.IsForgotten(v) {
		reqWithOwner.Header.Del(HeaderName)

		return reqWithOwner, true
	}

	room.TouchWithOwner(v, ownerID)

	reqWithOwner.Header.Del(HeaderName)

	return reqWithOwner.WithContext(WithContext(reqWithOwner.Context(), v)), false
}

// FromRequest extracts room ID from request context or headers.
func FromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}

	if v := FromContext(r.Context()); v != "" {
		return v
	}

	if v := strings.TrimSpace(r.Header.Get(HeaderName)); v != "" {
		return v
	}

	return ""
}

// FromContext extracts room ID from context.
func FromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}

	if v, ok := ctx.Value(contextKey{}).(string); ok {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}

	return ""
}

// OwnerFromContext extracts client identifier from context.
func OwnerFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}

	if v, ok := ctx.Value(ownerContextKey{}).(string); ok {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}

	return ""
}

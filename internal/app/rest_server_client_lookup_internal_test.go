package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	roominfra "github.com/radiantbald/gripmock/v3/internal/infra/room"
	"github.com/radiantbald/gripmock/v3/internal/infra/stuber"
)

func TestSplitClientID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		clientID         string
		wantPeerHost     string
		wantUserAgent    string
	}{
		{
			name:          "peer only",
			clientID:      "172.21.0.4",
			wantPeerHost:  "172.21.0.4",
			wantUserAgent: "",
		},
		{
			name:          "peer with user agent",
			clientID:      "172.21.0.4|grpcurl/1.9.3 grpc-go/1.61.0",
			wantPeerHost:  "172.21.0.4",
			wantUserAgent: "grpcurl/1.9.3 grpc-go/1.61.0",
		},
		{
			name:          "trim spaces",
			clientID:      " 172.21.0.4 | grpcurl ",
			wantPeerHost:  "172.21.0.4",
			wantUserAgent: "grpcurl",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			gotPeerHost, gotUserAgent := splitClientID(tt.clientID)
			if gotPeerHost != tt.wantPeerHost {
				t.Fatalf("unexpected peer host: got %q, want %q", gotPeerHost, tt.wantPeerHost)
			}
			if gotUserAgent != tt.wantUserAgent {
				t.Fatalf("unexpected user-agent: got %q, want %q", gotUserAgent, tt.wantUserAgent)
			}
		})
	}
}

func TestClientLookupCandidates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		clientID string
		want     []string
	}{
		{
			name:     "peer only",
			clientID: "172.21.0.4",
			want:     []string{"172.21.0.4"},
		},
		{
			name:     "peer with user-agent",
			clientID: "172.21.0.4|grpcurl/1.9.3 grpc-go/1.61.0",
			want:     []string{"172.21.0.4|grpcurl/1.9.3 grpc-go/1.61.0"},
		},
		{
			name:     "empty",
			clientID: "   ",
			want:     nil,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := clientLookupCandidates(tt.clientID)
			if len(got) != len(tt.want) {
				t.Fatalf("unexpected candidates len: got %d, want %d", len(got), len(tt.want))
			}

			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("unexpected candidate at %d: got %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestRoomsAssignPeerDoesNotCreatePeerOnlyAliasForFingerprintedClient(t *testing.T) {
	t.Parallel()

	server, err := NewRestServer(t.Context(), stuber.NewBudgerigar(), &mockExtender{}, nil, nil, nil)
	if err != nil {
		t.Fatalf("failed to create rest server: %v", err)
	}

	const (
		clientID = "172.21.0.4|grpcurl/1.9.3 grpc-go/1.61.0"
		peerHost = "172.21.0.4"
		roomID   = "2"
	)
	roominfra.UnassignClient(clientID)
	roominfra.UnassignClient(peerHost)
	t.Cleanup(func() {
		roominfra.UnassignClient(clientID)
		roominfra.UnassignClient(peerHost)
	})

	payload := map[string]string{
		"peer": clientID,
		"room": roomID,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/rooms/peers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	server.RoomsAssignPeer(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status code: got %d, want %d", rec.Code, http.StatusOK)
	}

	if mappedRoom := roominfra.RoomByClient(clientID); mappedRoom != roomID {
		t.Fatalf("unexpected fingerprinted mapping: got %q, want %q", mappedRoom, roomID)
	}
	if mappedRoom := roominfra.RoomByClient(peerHost); mappedRoom != "" {
		t.Fatalf("unexpected peer-only mapping: got %q, want empty", mappedRoom)
	}
}

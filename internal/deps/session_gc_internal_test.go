package deps

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/bavix/gripmock/v3/internal/config"
	"github.com/bavix/gripmock/v3/internal/domain/history"
	"github.com/bavix/gripmock/v3/internal/infra/session"
	"github.com/bavix/gripmock/v3/internal/infra/stuber"
)

func putStub(b *Builder, sessionID, message string) {
	b.Budgerigar().PutMany(&stuber.Stub{
		ID:      uuid.New(),
		Service: "svc.Greeter",
		Method:  "SayHello",
		Session: sessionID,
		Output:  stuber.Output{Data: map[string]any{"message": message}},
	})
}

func putHistory(b *Builder, sessionID string) {
	b.HistoryStore().Record(history.CallRecord{
		Service: "svc.Greeter",
		Method:  "SayHello",
		Session: sessionID,
	})
}

//nolint:paralleltest
func TestBuilderCleanupExpiredSessionsRemovesTouchedSessionData(t *testing.T) {
	b := NewBuilder(WithConfig(config.Config{HistoryEnabled: true}))
	sessionA := "A-" + uuid.NewString()
	sessionB := "B-" + uuid.NewString()
	putStub(b, sessionA, "A")
	putStub(b, sessionB, "B")
	putHistory(b, sessionA)
	putHistory(b, sessionB)

	session.Touch(sessionA)

	b.cleanupExpiredSessions(t.Context(), time.Now(), 0)

	all := b.Budgerigar().All()
	require.Len(t, all, 1)
	require.Equal(t, sessionB, all[0].Session)

	records := b.HistoryStore().All()
	require.Len(t, records, 1)
	require.Equal(t, sessionB, records[0].Session)
}

//nolint:paralleltest
func TestBuilderCleanupExpiredSessionsDoesNotDeleteGlobalSession(t *testing.T) {
	b := NewBuilder(WithConfig(config.Config{HistoryEnabled: true}))
	sessionA := "A-" + uuid.NewString()
	putStub(b, "", "GLOBAL")
	putStub(b, sessionA, "A")
	putHistory(b, "")
	putHistory(b, sessionA)

	session.Touch(sessionA)

	b.cleanupExpiredSessions(t.Context(), time.Now(), 0)

	all := b.Budgerigar().All()
	require.Len(t, all, 1)
	require.Empty(t, all[0].Session)
	require.Equal(t, "GLOBAL", all[0].Output.Data["message"])

	records := b.HistoryStore().All()
	require.Len(t, records, 1)
	require.Empty(t, records[0].Session)
}

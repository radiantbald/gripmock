package deps

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/bavix/gripmock/v3/internal/infra/session"
)

func (b *Builder) StartSessionGC(ctx context.Context) {
	_ = ctx
}

func (b *Builder) cleanupExpiredSessions(ctx context.Context, now time.Time, ttl time.Duration) {
	expired := session.Expired(now, ttl)
	if len(expired) == 0 {
		return
	}

	logger := zerolog.Ctx(ctx)
	historyStore := b.HistoryStore()

	for _, sessionID := range expired {
		deletedStubs := b.Budgerigar().DeleteSession(sessionID)
		deletedHistory := 0

		if historyStore != nil {
			deletedHistory = historyStore.DeleteSession(sessionID)
		}

		session.Forget(sessionID)

		if deletedStubs > 0 || deletedHistory > 0 {
			logger.Debug().
				Str("session", sessionID).
				Int("deleted_stubs", deletedStubs).
				Int("deleted_history", deletedHistory).
				Msg("session GC cleanup")
		}
	}
}

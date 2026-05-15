package deps

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/bavix/gripmock/v3/internal/infra/room"
)

func (b *Builder) StartRoomGC(ctx context.Context) {
	_ = ctx
}

func (b *Builder) cleanupExpiredRooms(ctx context.Context, now time.Time, ttl time.Duration) {
	expired := room.Expired(now, ttl)
	if len(expired) == 0 {
		return
	}

	logger := zerolog.Ctx(ctx)
	historyStore := b.HistoryStore()

	for _, roomID := range expired {
		deletedStubs := b.Budgerigar().DeleteRoom(roomID)
		deletedHistory := 0

		if historyStore != nil {
			deletedHistory = historyStore.DeleteRoom(roomID)
		}

		room.Forget(roomID)

		if deletedStubs > 0 || deletedHistory > 0 {
			logger.Debug().
				Str("room", roomID).
				Int("deleted_stubs", deletedStubs).
				Int("deleted_history", deletedHistory).
				Msg("room GC cleanup")
		}
	}
}

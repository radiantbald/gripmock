package deps

import (
	"context"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5/pgxpool"

	pgallowlist "github.com/bavix/gripmock/v3/internal/infra/postgres/allowlist"
	pgclients "github.com/bavix/gripmock/v3/internal/infra/postgres/clients"
	pgmigrations "github.com/bavix/gripmock/v3/internal/infra/postgres/migrations"
	pgprotometadata "github.com/bavix/gripmock/v3/internal/infra/postgres/protometadata"
	pgsessions "github.com/bavix/gripmock/v3/internal/infra/postgres/sessions"
	pgstubs "github.com/bavix/gripmock/v3/internal/infra/postgres/stubs"
	pgusers "github.com/bavix/gripmock/v3/internal/infra/postgres/users"
	"github.com/bavix/gripmock/v3/internal/infra/stuber"
)

const postgresPingTimeout = 5 * time.Second

func (b *Builder) initPersistentStore(ctx context.Context) (stuber.PersistentStore, error) {
	b.persistentStoreOnce.Do(func() {
		pool, err := b.initPostgresPool(ctx)
		if err != nil {
			b.persistentStoreErr = err

			return
		}

		b.persistentStore = pgstubs.NewRepository(pool)
	})

	return b.persistentStore, b.persistentStoreErr
}

func (b *Builder) UserRepository(ctx context.Context) (*pgusers.Repository, error) {
	b.usersRepositoryOnce.Do(func() {
		pool, err := b.initPostgresPool(ctx)
		if err != nil {
			b.usersRepositoryErr = err

			return
		}

		b.usersRepository = pgusers.NewRepository(pool)
	})

	return b.usersRepository, b.usersRepositoryErr
}

func (b *Builder) AllowedPhonesRepository(ctx context.Context) (*pgallowlist.Repository, error) {
	b.allowedPhonesRepositoryOnce.Do(func() {
		pool, err := b.initPostgresPool(ctx)
		if err != nil {
			b.allowedPhonesRepositoryErr = err

			return
		}

		b.allowedPhonesRepository = pgallowlist.NewRepository(pool)
	})

	return b.allowedPhonesRepository, b.allowedPhonesRepositoryErr
}

func (b *Builder) SessionsRepository(ctx context.Context) (*pgsessions.Repository, error) {
	b.sessionsRepositoryOnce.Do(func() {
		pool, err := b.initPostgresPool(ctx)
		if err != nil {
			b.sessionsRepositoryErr = err

			return
		}

		b.sessionsRepository = pgsessions.NewRepository(pool)
	})

	return b.sessionsRepository, b.sessionsRepositoryErr
}

func (b *Builder) ClientsRepository(ctx context.Context) (*pgclients.Repository, error) {
	b.clientsRepositoryOnce.Do(func() {
		pool, err := b.initPostgresPool(ctx)
		if err != nil {
			b.clientsRepositoryErr = err

			return
		}

		b.clientsRepository = pgclients.NewRepository(pool)
	})

	return b.clientsRepository, b.clientsRepositoryErr
}

func (b *Builder) ProtoMetadataRepository(ctx context.Context) (*pgprotometadata.Repository, error) {
	b.protoMetadataRepositoryOnce.Do(func() {
		pool, err := b.initPostgresPool(ctx)
		if err != nil {
			b.protoMetadataRepositoryErr = err

			return
		}

		b.protoMetadataRepository = pgprotometadata.NewRepository(pool)
	})

	return b.protoMetadataRepository, b.protoMetadataRepositoryErr
}

func (b *Builder) initPostgresPool(ctx context.Context) (*pgxpool.Pool, error) {
	b.postgresPoolOnce.Do(func() {
		dsn := strings.TrimSpace(b.config.PostgresDSN)
		if dsn == "" {
			b.postgresPoolErr = errors.New("POSTGRES_DSN is required")

			return
		}

		cfg, err := pgxpool.ParseConfig(dsn)
		if err != nil {
			b.postgresPoolErr = errors.Wrap(err, "failed to parse postgres dsn")

			return
		}

		if b.config.PostgresMaxOpenConns > 0 {
			cfg.MaxConns = b.config.PostgresMaxOpenConns
		}
		if b.config.PostgresMaxIdleConns > 0 {
			cfg.MinConns = b.config.PostgresMaxIdleConns
		}
		if b.config.PostgresConnMaxLifetime > 0 {
			cfg.MaxConnLifetime = b.config.PostgresConnMaxLifetime
		}

		pool, err := pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			b.postgresPoolErr = errors.Wrap(err, "failed to create postgres pool")

			return
		}

		pingCtx, cancel := context.WithTimeout(ctx, postgresPingTimeout)
		defer cancel()

		if err := pool.Ping(pingCtx); err != nil {
			pool.Close()
			b.postgresPoolErr = errors.Wrap(err, "failed to ping postgres")

			return
		}

		if err := pgmigrations.Apply(ctx, pool); err != nil {
			pool.Close()
			b.postgresPoolErr = errors.Wrap(err, "failed to apply postgres migrations")

			return
		}

		b.ender.Add(func(context.Context) error {
			pool.Close()

			return nil
		})
		b.postgresPool = pool
	})

	return b.postgresPool, b.postgresPoolErr
}

// EnsurePersistence wires persistent stub storage and hydrates in-memory index from DB.
func (b *Builder) EnsurePersistence(ctx context.Context) error {
	b.persistenceInitOnce.Do(func() {
		store, err := b.initPersistentStore(ctx)
		if err != nil {
			b.persistenceInitErr = err

			return
		}

		budgerigar := b.Budgerigar()
		budgerigar.SetPersistentStore(store)

		if err := budgerigar.HydrateFromPersistent(ctx); err != nil {
			b.persistenceInitErr = errors.Wrap(err, "failed to hydrate stubs from postgres")

			return
		}
	})

	return b.persistenceInitErr
}

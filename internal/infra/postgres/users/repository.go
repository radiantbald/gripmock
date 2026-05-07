package users

import (
	"context"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID        int64
	Phone     string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) UpsertByPhone(
	ctx context.Context,
	phone string,
) (*User, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO users (
			phone, created_at, updated_at
		) VALUES (
			$1, NOW(), NOW()
		)
		ON CONFLICT (phone) DO UPDATE SET
			updated_at = NOW()
		RETURNING id, phone, created_at, updated_at
	`, phone)

	item := new(User)
	if err := row.Scan(
		&item.ID,
		&item.Phone,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, errors.Wrap(err, "failed to upsert user")
	}

	return item, nil
}


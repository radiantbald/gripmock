package allowlist

import (
	"context"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Entry struct {
	Phone     string
	Code      string
	Active    bool
	Comment   string
	ExpiresAt *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Upsert(ctx context.Context, entry Entry) (*Entry, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO white_list (
			phone, code, active, comment, expires_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, NOW(), NOW()
		)
		ON CONFLICT (phone) DO UPDATE SET
			code = EXCLUDED.code,
			active = EXCLUDED.active,
			comment = EXCLUDED.comment,
			expires_at = EXCLUDED.expires_at,
			updated_at = NOW()
		RETURNING phone, code, active, comment, expires_at, created_at, updated_at
	`, entry.Phone, entry.Code, entry.Active, entry.Comment, entry.ExpiresAt)

	out := new(Entry)
	if err := row.Scan(
		&out.Phone,
		&out.Code,
		&out.Active,
		&out.Comment,
		&out.ExpiresAt,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		return nil, errors.Wrap(err, "failed to upsert allowed phone")
	}

	return out, nil
}

func (r *Repository) FindAllowedByPhone(ctx context.Context, phone string, now time.Time) (*Entry, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT phone, code, active, comment, expires_at, created_at, updated_at
		FROM white_list
		WHERE phone = $1
		  AND active = TRUE
		  AND (expires_at IS NULL OR expires_at > $2)
	`, phone, now)

	out := new(Entry)
	if err := row.Scan(
		&out.Phone,
		&out.Code,
		&out.Active,
		&out.Comment,
		&out.ExpiresAt,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, errors.Wrap(err, "failed to find allowed phone")
	}

	return out, nil
}

func (r *Repository) List(ctx context.Context) ([]Entry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT phone, code, active, comment, expires_at, created_at, updated_at
		FROM white_list
		ORDER BY phone ASC
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list allowed phones")
	}
	defer rows.Close()

	items := make([]Entry, 0)
	for rows.Next() {
		var item Entry
		if scanErr := rows.Scan(
			&item.Phone,
			&item.Code,
			&item.Active,
			&item.Comment,
			&item.ExpiresAt,
			&item.CreatedAt,
			&item.UpdatedAt,
		); scanErr != nil {
			return nil, errors.Wrap(scanErr, "failed to scan allowed phone")
		}

		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed while iterating allowed phones")
	}

	return items, nil
}

func (r *Repository) Delete(ctx context.Context, phone string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM white_list WHERE phone = $1`, phone)
	if err != nil {
		return errors.Wrap(err, "failed to delete allowed phone")
	}

	return nil
}

package reflectionhosts

import (
	"context"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

type Host struct {
	ID        int64
	Host      string
	Source    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Upsert(ctx context.Context, host string, source string) (Host, error) {
	host = strings.TrimSpace(host)
	source = strings.TrimSpace(source)
	if host == "" || source == "" {
		return Host{}, errors.New("reflection host and source are required")
	}

	var row Host
	err := r.pool.QueryRow(ctx, `
		INSERT INTO reflection_hosts (host, source, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (host) DO UPDATE
		SET source = EXCLUDED.source,
			updated_at = NOW()
		RETURNING id, host, source, created_at, updated_at
	`, host, source).Scan(&row.ID, &row.Host, &row.Source, &row.CreatedAt, &row.UpdatedAt)
	if err != nil {
		return Host{}, errors.Wrap(err, "failed to upsert reflection host")
	}

	row.Host = strings.TrimSpace(row.Host)
	row.Source = strings.TrimSpace(row.Source)

	return row, nil
}

func (r *Repository) List(ctx context.Context) ([]Host, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, host, source, created_at, updated_at
		FROM reflection_hosts
		ORDER BY updated_at DESC, id DESC
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list reflection hosts")
	}
	defer rows.Close()

	result := make([]Host, 0)
	for rows.Next() {
		var item Host
		if err := rows.Scan(&item.ID, &item.Host, &item.Source, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, errors.Wrap(err, "failed to scan reflection host")
		}

		item.Host = strings.TrimSpace(item.Host)
		item.Source = strings.TrimSpace(item.Source)
		if item.Host == "" || item.Source == "" {
			continue
		}

		result = append(result, item)
	}

	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed while reading reflection hosts")
	}

	return result, nil
}

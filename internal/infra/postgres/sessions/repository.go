package sessions

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

type Row struct {
	ID   int64
	Name string
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func buildCreator(owner string) string {
	normalizedOwner := strings.TrimSpace(owner)
	if normalizedOwner == "" {
		normalizedOwner = "anonymous"
	}

	return fmt.Sprintf("manual:%s:%s", normalizedOwner, strconv.FormatInt(time.Now().UnixNano(), 36))
}

func (r *Repository) Touch(ctx context.Context, sessionName string, creator string) error {
	sessionName = strings.TrimSpace(sessionName)
	if sessionName == "" {
		return nil
	}

	creator = strings.TrimSpace(creator)
	if creator == "" {
		creator = "anonymous"
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO sessions (name, creator, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (creator) DO UPDATE SET
			name = EXCLUDED.name,
			updated_at = NOW()
	`, sessionName, creator)
	if err != nil {
		return errors.Wrap(err, "failed to touch session")
	}

	return nil
}

func (r *Repository) Create(ctx context.Context, sessionName string, owner string) (Row, error) {
	sessionName = strings.TrimSpace(sessionName)
	if sessionName == "" {
		return Row{}, errors.New("session name is required")
	}

	creator := buildCreator(owner)
	var row Row
	err := r.pool.QueryRow(ctx, `
		INSERT INTO sessions (name, creator, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		RETURNING id, name
	`, sessionName, creator).Scan(&row.ID, &row.Name)
	if err != nil {
		return Row{}, errors.Wrap(err, "failed to create session")
	}

	row.Name = strings.TrimSpace(row.Name)

	return row, nil
}

func (r *Repository) ListRows(ctx context.Context) ([]Row, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name
		FROM sessions
		WHERE name <> ''
		ORDER BY id
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list session rows")
	}
	defer rows.Close()

	result := make([]Row, 0)
	for rows.Next() {
		var item Row
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, errors.Wrap(err, "failed to scan session row")
		}

		item.Name = strings.TrimSpace(item.Name)
		if item.Name == "" {
			continue
		}

		result = append(result, item)
	}

	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed while reading sessions rows")
	}

	return result, nil
}

func (r *Repository) List(ctx context.Context) ([]string, error) {
	rows, err := r.ListRows(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]string, 0, len(rows))
	for _, item := range rows {
		result = append(result, item.Name)
	}

	slices.Sort(result)
	result = slices.Compact(result)

	return result, nil
}

func (r *Repository) DeleteByName(ctx context.Context, sessionName string) (int, error) {
	sessionName = strings.TrimSpace(sessionName)
	if sessionName == "" {
		return 0, nil
	}

	commandTag, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE name = $1`, sessionName)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete session by name")
	}

	return int(commandTag.RowsAffected()), nil
}

func (r *Repository) DeleteByID(ctx context.Context, sessionID int64) (int, error) {
	commandTag, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, sessionID)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete session by id")
	}

	return int(commandTag.RowsAffected()), nil
}

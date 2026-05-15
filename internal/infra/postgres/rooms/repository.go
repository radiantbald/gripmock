package rooms

import (
	"context"
	stderrors "errors"
	"slices"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5"
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
		return "anonymous"
	}

	return normalizedOwner
}

func (r *Repository) Touch(ctx context.Context, roomName string, creator string) error {
	roomName = strings.TrimSpace(roomName)
	if roomName == "" {
		return nil
	}

	creator = strings.TrimSpace(creator)
	if creator == "" {
		creator = "anonymous"
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO rooms (name, creator, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
	`, roomName, creator)
	if err != nil {
		return errors.Wrap(err, "failed to touch room")
	}

	return nil
}

func (r *Repository) Create(ctx context.Context, roomName string, owner string) (Row, error) {
	roomName = strings.TrimSpace(roomName)
	if roomName == "" {
		return Row{}, errors.New("room name is required")
	}

	creator := buildCreator(owner)
	var row Row
	err := r.pool.QueryRow(ctx, `
		INSERT INTO rooms (name, creator, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		RETURNING id, name
	`, roomName, creator).Scan(&row.ID, &row.Name)
	if err != nil {
		return Row{}, errors.Wrap(err, "failed to create room")
	}

	row.Name = strings.TrimSpace(row.Name)

	return row, nil
}

func (r *Repository) ListRows(ctx context.Context) ([]Row, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name
		FROM rooms
		WHERE name <> ''
		ORDER BY id
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list room rows")
	}
	defer rows.Close()

	result := make([]Row, 0)
	for rows.Next() {
		var item Row
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, errors.Wrap(err, "failed to scan room row")
		}

		item.Name = strings.TrimSpace(item.Name)
		if item.Name == "" {
			continue
		}

		result = append(result, item)
	}

	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed while reading rooms rows")
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

func (r *Repository) DeleteByName(ctx context.Context, roomName string) (int, error) {
	roomName = strings.TrimSpace(roomName)
	if roomName == "" {
		return 0, nil
	}

	commandTag, err := r.pool.Exec(ctx, `DELETE FROM rooms WHERE name = $1`, roomName)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete room by name")
	}

	return int(commandTag.RowsAffected()), nil
}

func (r *Repository) DeleteByID(ctx context.Context, roomID int64) (int, error) {
	commandTag, err := r.pool.Exec(ctx, `DELETE FROM rooms WHERE id = $1`, roomID)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete room by id")
	}

	return int(commandTag.RowsAffected()), nil
}

func (r *Repository) CreatorByID(ctx context.Context, roomID int64) (string, error) {
	var creator string
	err := r.pool.QueryRow(ctx, `SELECT creator FROM rooms WHERE id = $1`, roomID).Scan(&creator)
	if err != nil {
		if stderrors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}

		return "", errors.Wrap(err, "failed to find room creator by id")
	}

	return strings.TrimSpace(creator), nil
}

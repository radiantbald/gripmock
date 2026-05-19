package clients

import (
	"context"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

type Route struct {
	ID        int64
	RoomID    string
	Name      string
	UserID    string
	PeerHost  string
	UserAgent string
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Upsert(
	ctx context.Context,
	roomID string,
	name string,
	userID string,
	peerHost string,
	userAgent string,
) error {
	roomID = strings.TrimSpace(roomID)
	name = strings.TrimSpace(name)
	userID = strings.TrimSpace(userID)
	peerHost = strings.TrimSpace(peerHost)
	userAgent = strings.TrimSpace(userAgent)
	if clientKey(peerHost, userAgent) == "" || roomID == "" {
		return errors.New("peer/user-agent and room_id are required")
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO clients (room_id, name, "user", peer_host, user_agent, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		ON CONFLICT (peer_host, user_agent) DO UPDATE
		SET room_id = EXCLUDED.room_id,
			name = COALESCE(NULLIF(EXCLUDED.name, ''), clients.name),
			"user" = COALESCE(NULLIF(EXCLUDED."user", ''), clients."user"),
			peer_host = COALESCE(NULLIF(EXCLUDED.peer_host, ''), clients.peer_host),
			user_agent = COALESCE(NULLIF(EXCLUDED.user_agent, ''), clients.user_agent),
			updated_at = NOW()
	`, roomID, name, userID, peerHost, userAgent)
	if err != nil {
		return errors.Wrap(err, "failed to upsert client route")
	}

	return nil
}

func (r *Repository) RoomByClientKey(ctx context.Context, key string) (string, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "", nil
	}
	peerHost, userAgent := splitClientKey(key)

	var roomID string
	err := r.pool.QueryRow(
		ctx,
		`SELECT room_id FROM clients WHERE peer_host = $1 AND user_agent = $2`,
		peerHost,
		userAgent,
	).Scan(&roomID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}

		return "", errors.Wrap(err, "failed to resolve room by client")
	}

	return strings.TrimSpace(roomID), nil
}

func (r *Repository) List(ctx context.Context) ([]Route, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, room_id, name, "user", peer_host, user_agent
		FROM clients
		WHERE (peer_host <> '' OR user_agent <> '') AND room_id <> ''
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list client routes")
	}
	defer rows.Close()

	result := make([]Route, 0)
	for rows.Next() {
		var item Route
		if scanErr := rows.Scan(
			&item.ID,
			&item.RoomID,
			&item.Name,
			&item.UserID,
			&item.PeerHost,
			&item.UserAgent,
		); scanErr != nil {
			return nil, errors.Wrap(scanErr, "failed to scan client route")
		}

		item.RoomID = strings.TrimSpace(item.RoomID)
		item.Name = strings.TrimSpace(item.Name)
		item.UserID = strings.TrimSpace(item.UserID)
		item.PeerHost = strings.TrimSpace(item.PeerHost)
		item.UserAgent = strings.TrimSpace(item.UserAgent)
		if item.ID <= 0 || clientKey(item.PeerHost, item.UserAgent) == "" || item.RoomID == "" {
			continue
		}

		result = append(result, item)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, errors.Wrap(rowsErr, "failed while reading client routes")
	}

	return result, nil
}

func normalizeOptionalText(value *string) *string {
	if value == nil {
		return nil
	}

	normalized := strings.TrimSpace(*value)
	return &normalized
}

func (r *Repository) Update(ctx context.Context, clientID int64, roomID *string, name *string) (*Route, error) {
	if clientID <= 0 {
		return nil, errors.New("client id is required")
	}

	normalizedRoomID := normalizeOptionalText(roomID)
	if normalizedRoomID != nil && *normalizedRoomID == "" {
		return nil, errors.New("room_id must not be empty")
	}
	normalizedName := normalizeOptionalText(name)

	var row Route
	err := r.pool.QueryRow(ctx, `
		UPDATE clients
		SET room_id = COALESCE($2, room_id),
		    name = COALESCE($3, name),
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, room_id, name, "user", peer_host, user_agent
	`, clientID, normalizedRoomID, normalizedName).Scan(
		&row.ID,
		&row.RoomID,
		&row.Name,
		&row.UserID,
		&row.PeerHost,
		&row.UserAgent,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}

		return nil, errors.Wrap(err, "failed to update client")
	}

	row.RoomID = strings.TrimSpace(row.RoomID)
	row.Name = strings.TrimSpace(row.Name)
	row.UserID = strings.TrimSpace(row.UserID)
	row.PeerHost = strings.TrimSpace(row.PeerHost)
	row.UserAgent = strings.TrimSpace(row.UserAgent)

	return &row, nil
}

func (r *Repository) DeleteByRoom(ctx context.Context, roomID string) (int, error) {
	roomID = strings.TrimSpace(roomID)
	if roomID == "" {
		return 0, nil
	}

	tag, err := r.pool.Exec(ctx, `DELETE FROM clients WHERE room_id = $1`, roomID)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete clients by room")
	}

	return int(tag.RowsAffected()), nil
}

func (r *Repository) DeleteByID(ctx context.Context, clientID int64) (string, string, error) {
	if clientID <= 0 {
		return "", "", nil
	}

	var (
		deletedPeerHost  string
		deletedUserAgent string
	)
	err := r.pool.QueryRow(
		ctx,
		`DELETE FROM clients WHERE id = $1 RETURNING peer_host, user_agent`,
		clientID,
	).Scan(&deletedPeerHost, &deletedUserAgent)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", nil
		}
		return "", "", errors.Wrap(err, "failed to delete client")
	}

	return strings.TrimSpace(deletedPeerHost), strings.TrimSpace(deletedUserAgent), nil
}

func splitClientKey(value string) (string, string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", ""
	}

	parts := strings.SplitN(value, "|", 2)
	peerHost := strings.TrimSpace(parts[0])
	if len(parts) < 2 {
		return peerHost, ""
	}

	return peerHost, strings.TrimSpace(parts[1])
}

func clientKey(peerHost, userAgent string) string {
	peerHost = strings.TrimSpace(peerHost)
	userAgent = strings.TrimSpace(userAgent)
	if peerHost == "" && userAgent == "" {
		return ""
	}

	return peerHost + "|" + userAgent
}

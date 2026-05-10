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
	ClientID    string
	SessionID   string
	UserID      string
	PeerHost    string
	UserAgent   string
	Fingerprint string
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Upsert(
	ctx context.Context,
	clientID string,
	sessionID string,
	userID string,
	peerHost string,
	userAgent string,
	fingerprint string,
) error {
	clientID = strings.TrimSpace(clientID)
	sessionID = strings.TrimSpace(sessionID)
	userID = strings.TrimSpace(userID)
	peerHost = strings.TrimSpace(peerHost)
	userAgent = strings.TrimSpace(userAgent)
	fingerprint = strings.TrimSpace(fingerprint)
	if clientID == "" || sessionID == "" {
		return errors.New("client_id and session_id are required")
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO clients (client_id, session_id, "user", peer_host, user_agent, fingerprint, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		ON CONFLICT (client_id) DO UPDATE
		SET session_id = EXCLUDED.session_id,
			"user" = COALESCE(NULLIF(EXCLUDED."user", ''), clients."user"),
			peer_host = COALESCE(NULLIF(EXCLUDED.peer_host, ''), clients.peer_host),
			user_agent = COALESCE(NULLIF(EXCLUDED.user_agent, ''), clients.user_agent),
			fingerprint = COALESCE(NULLIF(EXCLUDED.fingerprint, ''), clients.fingerprint),
			updated_at = NOW()
	`, clientID, sessionID, userID, peerHost, userAgent, fingerprint)
	if err != nil {
		return errors.Wrap(err, "failed to upsert client route")
	}

	return nil
}

func (r *Repository) SessionByClient(ctx context.Context, clientID string) (string, error) {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return "", nil
	}

	var sessionID string
	err := r.pool.QueryRow(ctx, `SELECT session_id FROM clients WHERE client_id = $1`, clientID).Scan(&sessionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}

		return "", errors.Wrap(err, "failed to resolve session by client")
	}

	return strings.TrimSpace(sessionID), nil
}

func (r *Repository) List(ctx context.Context) ([]Route, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT client_id, session_id, "user", peer_host, user_agent, fingerprint
		FROM clients
		WHERE client_id <> '' AND session_id <> ''
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list client routes")
	}
	defer rows.Close()

	result := make([]Route, 0)
	for rows.Next() {
		var item Route
		if scanErr := rows.Scan(
			&item.ClientID,
			&item.SessionID,
			&item.UserID,
			&item.PeerHost,
			&item.UserAgent,
			&item.Fingerprint,
		); scanErr != nil {
			return nil, errors.Wrap(scanErr, "failed to scan client route")
		}

		item.ClientID = strings.TrimSpace(item.ClientID)
		item.SessionID = strings.TrimSpace(item.SessionID)
		item.UserID = strings.TrimSpace(item.UserID)
		item.PeerHost = strings.TrimSpace(item.PeerHost)
		item.UserAgent = strings.TrimSpace(item.UserAgent)
		item.Fingerprint = strings.TrimSpace(item.Fingerprint)
		if item.ClientID == "" || item.SessionID == "" {
			continue
		}

		result = append(result, item)
	}

	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, errors.Wrap(rowsErr, "failed while reading client routes")
	}

	return result, nil
}

func (r *Repository) DeleteBySession(ctx context.Context, sessionID string) (int, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return 0, nil
	}

	tag, err := r.pool.Exec(ctx, `DELETE FROM clients WHERE session_id = $1`, sessionID)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete clients by session")
	}

	return int(tag.RowsAffected()), nil
}

package stubs

import (
	"context"
	"crypto/md5"
	"fmt"
	"strconv"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/goccy/go-json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bavix/gripmock/v3/internal/infra/stuber"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) UpsertMany(ctx context.Context, stubs ...*stuber.Stub) ([]uuid.UUID, error) {
	if len(stubs) == 0 {
		return nil, nil
	}

	batch := &pgx.Batch{}
	for _, item := range stubs {
		optionsJSON, err := json.Marshal(item.Options)
		if err != nil {
			return nil, errors.Wrap(err, "failed to marshal stub options")
		}

		headersJSON, err := json.Marshal(item.Headers)
		if err != nil {
			return nil, errors.Wrap(err, "failed to marshal stub headers")
		}

		inputJSON, err := json.Marshal(item.Input)
		if err != nil {
			return nil, errors.Wrap(err, "failed to marshal stub input")
		}

		inputsJSON, err := json.Marshal(item.Inputs)
		if err != nil {
			return nil, errors.Wrap(err, "failed to marshal stub inputs")
		}

		outputJSON, err := json.Marshal(item.Output)
		if err != nil {
			return nil, errors.Wrap(err, "failed to marshal stub output")
		}

		effectsJSON, err := json.Marshal(item.Effects)
		if err != nil {
			return nil, errors.Wrap(err, "failed to marshal stub effects")
		}

		var sessionRef any
		rawSession := strings.TrimSpace(item.Session)
		if rawSession != "" {
			if parsedID, parseErr := strconv.ParseInt(rawSession, 10, 64); parseErr == nil {
				sessionRef = parsedID
			} else {
				creator := fmt.Sprintf("stub-bind:%x", md5.Sum([]byte(rawSession)))
				var createdID int64
				if scanErr := r.pool.QueryRow(ctx, `
					INSERT INTO sessions (name, creator, created_at, updated_at)
					VALUES ($1, $2, NOW(), NOW())
					ON CONFLICT (creator) DO UPDATE SET
						name = EXCLUDED.name,
						updated_at = NOW()
					RETURNING id
				`, rawSession, creator).Scan(&createdID); scanErr != nil {
					return nil, errors.Wrap(scanErr, "failed to resolve session by name")
				}
				sessionRef = createdID
				item.Session = strconv.FormatInt(createdID, 10)
			}
		}

		batch.Queue(`
			INSERT INTO stubs (
				id, name, service, method, session, priority, enabled, options, headers, input, inputs, output, effects, source
			) VALUES (
				$1, $2, $3, $4, $5,
				$6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14
			)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				service = EXCLUDED.service,
				method = EXCLUDED.method,
				session = EXCLUDED.session,
				priority = EXCLUDED.priority,
				enabled = EXCLUDED.enabled,
				options = EXCLUDED.options,
				headers = EXCLUDED.headers,
				input = EXCLUDED.input,
				inputs = EXCLUDED.inputs,
				output = EXCLUDED.output,
				effects = EXCLUDED.effects,
				source = EXCLUDED.source,
				updated_at = NOW()
		`,
			item.ID,
			item.Name,
			item.Service,
			item.Method,
			sessionRef,
			item.Priority,
			item.IsEnabled(),
			optionsJSON,
			headersJSON,
			inputJSON,
			inputsJSON,
			outputJSON,
			effectsJSON,
			item.Source,
		)
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range stubs {
		if _, err := br.Exec(); err != nil {
			return nil, errors.Wrap(err, "failed to upsert stubs")
		}
	}

	ids := make([]uuid.UUID, len(stubs))
	for i, item := range stubs {
		ids[i] = item.ID
	}

	return ids, nil
}

func (r *Repository) DeleteByID(ctx context.Context, ids ...uuid.UUID) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}

	commandTag, err := r.pool.Exec(ctx, `DELETE FROM stubs WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete stubs by id")
	}

	return int(commandTag.RowsAffected()), nil
}

func (r *Repository) DeleteSession(ctx context.Context, session string) (int, error) {
	if parsedID, err := strconv.ParseInt(strings.TrimSpace(session), 10, 64); err == nil {
		commandTag, execErr := r.pool.Exec(ctx, `DELETE FROM stubs WHERE session = $1`, parsedID)
		if execErr != nil {
			return 0, errors.Wrap(execErr, "failed to delete stubs by session id")
		}

		return int(commandTag.RowsAffected()), nil
	}

	commandTag, err := r.pool.Exec(ctx, `
		DELETE FROM stubs
		WHERE session IN (
			SELECT id
			FROM sessions
			WHERE name = $1
		)
	`, session)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete stubs by session")
	}

	return int(commandTag.RowsAffected()), nil
}

func (r *Repository) Clear(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `TRUNCATE TABLE stubs`)

	return errors.Wrap(err, "failed to truncate stubs")
}

func (r *Repository) LoadAll(ctx context.Context) ([]*stuber.Stub, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT stubs.id, stubs.name, stubs.service, stubs.method, COALESCE(stubs.session::text, ''), stubs.priority, stubs.enabled, stubs.options, stubs.headers, stubs.input, stubs.inputs, stubs.output, stubs.effects, stubs.source
		FROM stubs
		LEFT JOIN sessions ON sessions.id = stubs.session
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to query stubs")
	}
	defer rows.Close()

	result := make([]*stuber.Stub, 0)
	for rows.Next() {
		item, decodeErr := scanStub(rows)
		if decodeErr != nil {
			return nil, decodeErr
		}

		result = append(result, item)
	}

	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed while reading stubs rows")
	}

	return result, nil
}

func (r *Repository) List(ctx context.Context, options stuber.ListOptions) ([]*stuber.Stub, error) {
	clauses := make([]string, 0, 5)
	args := make([]any, 0, 5)
	nextArg := 1

	if options.Source != "" {
		clauses = append(clauses, fmt.Sprintf("source = $%d", nextArg))
		args = append(args, options.Source)
		nextArg++
	}

	if options.Name != "" {
		clauses = append(clauses, fmt.Sprintf("name = $%d", nextArg))
		args = append(args, options.Name)
		nextArg++
	}

	if options.Service != "" {
		clauses = append(clauses, fmt.Sprintf("service = $%d", nextArg))
		args = append(args, options.Service)
		nextArg++
	}

	if options.Method != "" {
		clauses = append(clauses, fmt.Sprintf("method = $%d", nextArg))
		args = append(args, options.Method)
		nextArg++
	}

	if options.SessionSet {
		session := strings.TrimSpace(options.Session)
		if session == "" {
			clauses = append(clauses, "stubs.session IS NULL")
		} else {
			if parsedID, parseErr := strconv.ParseInt(session, 10, 64); parseErr == nil {
				clauses = append(clauses, fmt.Sprintf("stubs.session = $%d", nextArg))
				args = append(args, parsedID)
				nextArg++
			} else {
				clauses = append(clauses, fmt.Sprintf(
					`stubs.session IN (SELECT id FROM sessions WHERE name = $%d)`,
					nextArg,
				))
				args = append(args, session)
				nextArg++
			}
		}
	}

	query := `
		SELECT stubs.id, stubs.name, stubs.service, stubs.method, COALESCE(stubs.session::text, ''), stubs.priority, stubs.enabled, stubs.options, stubs.headers, stubs.input, stubs.inputs, stubs.output, stubs.effects, stubs.source
		FROM stubs
		LEFT JOIN sessions ON sessions.id = stubs.session
	`
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list stubs")
	}
	defer rows.Close()

	result := make([]*stuber.Stub, 0)
	for rows.Next() {
		item, decodeErr := scanStub(rows)
		if decodeErr != nil {
			return nil, decodeErr
		}

		result = append(result, item)
	}

	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed while reading list stubs rows")
	}

	return result, nil
}

func scanStub(rows pgx.Rows) (*stuber.Stub, error) {
	var (
		item    stuber.Stub
		enabled bool
		options []byte
		headers []byte
		input   []byte
		inputs  []byte
		output  []byte
		effects []byte
	)

	if err := rows.Scan(
		&item.ID,
		&item.Name,
		&item.Service,
		&item.Method,
		&item.Session,
		&item.Priority,
		&enabled,
		&options,
		&headers,
		&input,
		&inputs,
		&output,
		&effects,
		&item.Source,
	); err != nil {
		return nil, errors.Wrap(err, "failed to scan stub row")
	}

	item.SetEnabled(enabled)

	if err := json.Unmarshal(options, &item.Options); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal stub options")
	}
	if err := json.Unmarshal(headers, &item.Headers); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal stub headers")
	}
	if err := json.Unmarshal(input, &item.Input); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal stub input")
	}
	if err := json.Unmarshal(inputs, &item.Inputs); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal stub inputs")
	}
	if err := json.Unmarshal(output, &item.Output); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal stub output")
	}
	if err := json.Unmarshal(effects, &item.Effects); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal stub effects")
	}

	return &item, nil
}

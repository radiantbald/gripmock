package stubs

import (
	"context"
	"crypto/md5"
	"fmt"
	"strconv"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/goccy/go-json"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/radiantbald/gripmock/v3/internal/infra/stuber"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) UpsertMany(ctx context.Context, stubs ...*stuber.Stub) ([]uint64, error) {
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

		batch.Queue(`
			INSERT INTO stubs (
				id, name, service, method, options, headers, input, inputs, output, effects, source
			) VALUES (
				$1, $2, $3, $4,
				$5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11
			)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				service = EXCLUDED.service,
				method = EXCLUDED.method,
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

	ids := make([]uint64, len(stubs))
	for i, item := range stubs {
		ids[i] = item.ID
	}

	return ids, nil
}

func (r *Repository) DeleteByID(ctx context.Context, ids ...uint64) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}

	commandTag, err := r.pool.Exec(ctx, `DELETE FROM stubs WHERE id = ANY($1::bigint[])`, ids)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete stubs by id")
	}

	return int(commandTag.RowsAffected()), nil
}

func (r *Repository) DeleteRoom(ctx context.Context, room string) (int, error) {
	roomID, err := r.resolveRoomID(ctx, room)
	if err != nil {
		return 0, err
	}
	if roomID == nil {
		return 0, nil
	}

	commandTag, err := r.pool.Exec(ctx, `
		DELETE FROM enabled_stubs
		WHERE room_id = $1
	`, *roomID)
	if err != nil {
		return 0, errors.Wrap(err, "failed to delete room state by room")
	}

	return int(commandTag.RowsAffected()), nil
}

func (r *Repository) UpsertRoomState(ctx context.Context, updates ...stuber.RoomEnabledState) error {
	if len(updates) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, item := range updates {
		roomID, err := r.resolveRoomID(ctx, item.Room)
		if err != nil {
			return err
		}
		if roomID == nil {
			return errors.New("room is required")
		}

		batch.Queue(`
			DELETE FROM enabled_stubs
			WHERE stub_id = $1 AND room_id = $2
		`, item.StubID, *roomID)
		if item.Enabled {
			batch.Queue(`
				INSERT INTO enabled_stubs (stub_id, room_id, stub_enabled_at)
				VALUES ($1, $2, NOW())
				ON CONFLICT (stub_id, room_id) DO UPDATE SET
					stub_enabled_at = EXCLUDED.stub_enabled_at
			`, item.StubID, *roomID)
		}
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	for _, item := range updates {
		if _, err := br.Exec(); err != nil {
			return errors.Wrap(err, "failed to upsert room state")
		}
		if item.Enabled {
			if _, err := br.Exec(); err != nil {
				return errors.Wrap(err, "failed to upsert room state")
			}
		}
	}

	return nil
}

func (r *Repository) LoadRoomState(ctx context.Context) ([]stuber.RoomEnabledState, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT es.stub_id, es.room_id::text, TRUE
		FROM enabled_stubs AS es
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to query room state")
	}
	defer rows.Close()

	result := make([]stuber.RoomEnabledState, 0)
	for rows.Next() {
		var item stuber.RoomEnabledState
		if err := rows.Scan(&item.StubID, &item.Room, &item.Enabled); err != nil {
			return nil, errors.Wrap(err, "failed to scan room state row")
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed while reading room state rows")
	}

	return result, nil
}

func (r *Repository) Clear(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `TRUNCATE TABLE stubs, enabled_stubs RESTART IDENTITY`)

	return errors.Wrap(err, "failed to truncate stubs")
}

func (r *Repository) LoadAll(ctx context.Context) ([]*stuber.Stub, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT stubs.id, stubs.name, stubs.service, stubs.method, stubs.options, stubs.headers, stubs.input, stubs.inputs, stubs.output, stubs.effects, stubs.source
		FROM stubs
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

	query := `
		SELECT stubs.id, stubs.name, stubs.service, stubs.method, stubs.options, stubs.headers, stubs.input, stubs.inputs, stubs.output, stubs.effects, stubs.source
		FROM stubs
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

	item.Room = ""

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

func (r *Repository) resolveRoomID(ctx context.Context, room string) (*int64, error) {
	rawRoom := strings.TrimSpace(room)
	if rawRoom == "" {
		return nil, nil
	}

	if parsedID, parseErr := strconv.ParseInt(rawRoom, 10, 64); parseErr == nil {
		return &parsedID, nil
	}

	creator := fmt.Sprintf("stub-bind:%x", md5.Sum([]byte(rawRoom)))
	var createdID int64
	if scanErr := r.pool.QueryRow(ctx, `
		INSERT INTO rooms (name, creator, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (creator) DO UPDATE SET
			name = EXCLUDED.name,
			updated_at = NOW()
		RETURNING id
	`, rawRoom, creator).Scan(&createdID); scanErr != nil {
		return nil, errors.Wrap(scanErr, "failed to resolve room by name")
	}

	return &createdID, nil
}

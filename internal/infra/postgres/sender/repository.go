package sender

import (
	"context"
	"strings"

	"github.com/cockroachdb/errors"
	"github.com/goccy/go-json"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	senderdom "github.com/radiantbald/gripmock/v3/internal/domain/sender"
)

type Repository struct {
	pool *pgxpool.Pool
}

type CreateRequestParams struct {
	CollectionID int64
	Name         string
	TargetHost   string
	Service      string
	Method       string
	SchemaSource string
	Metadata     map[string]string
	Payload      map[string]any
}

type UpdateRequestParams struct {
	CollectionID *int64
	Name         *string
	TargetHost   *string
	Service      *string
	Method       *string
	SchemaSource *string
	Metadata     *map[string]string
	Payload      *map[string]any
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) ListCollections(ctx context.Context) ([]senderdom.Collection, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, description, created_at, updated_at
		FROM sender_collections
		ORDER BY updated_at DESC, id DESC
	`)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list sender collections")
	}
	defer rows.Close()

	result := make([]senderdom.Collection, 0)
	for rows.Next() {
		var item senderdom.Collection
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, errors.Wrap(err, "failed to scan sender collection")
		}
		item.Name = strings.TrimSpace(item.Name)
		item.Description = strings.TrimSpace(item.Description)
		if item.ID <= 0 || item.Name == "" {
			continue
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed to read sender collections")
	}

	return result, nil
}

func (r *Repository) CreateCollection(
	ctx context.Context,
	name string,
	description string,
) (senderdom.Collection, error) {
	name = strings.TrimSpace(name)
	description = strings.TrimSpace(description)
	if name == "" {
		return senderdom.Collection{}, errors.New("collection name is required")
	}

	var item senderdom.Collection
	err := r.pool.QueryRow(ctx, `
		INSERT INTO sender_collections (name, description, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		RETURNING id, name, description, created_at, updated_at
	`, name, description).Scan(
		&item.ID,
		&item.Name,
		&item.Description,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return senderdom.Collection{}, errors.Wrap(err, "failed to create sender collection")
	}

	return item, nil
}

func (r *Repository) UpdateCollection(
	ctx context.Context,
	id int64,
	name *string,
	description *string,
) (*senderdom.Collection, error) {
	if id <= 0 {
		return nil, errors.New("collection id is required")
	}

	var (
		normalizedName        *string
		normalizedDescription *string
	)
	if name != nil {
		n := strings.TrimSpace(*name)
		if n == "" {
			return nil, errors.New("collection name must not be empty")
		}
		normalizedName = &n
	}
	if description != nil {
		d := strings.TrimSpace(*description)
		normalizedDescription = &d
	}

	var item senderdom.Collection
	err := r.pool.QueryRow(ctx, `
		UPDATE sender_collections
		SET name = COALESCE($2, name),
		    description = COALESCE($3, description),
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, description, created_at, updated_at
	`, id, normalizedName, normalizedDescription).Scan(
		&item.ID,
		&item.Name,
		&item.Description,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, errors.Wrap(err, "failed to update sender collection")
	}

	return &item, nil
}

func (r *Repository) DeleteCollection(ctx context.Context, id int64) (bool, error) {
	if id <= 0 {
		return false, nil
	}
	tag, err := r.pool.Exec(ctx, `DELETE FROM sender_collections WHERE id = $1`, id)
	if err != nil {
		return false, errors.Wrap(err, "failed to delete sender collection")
	}

	return tag.RowsAffected() > 0, nil
}

func (r *Repository) ListRequests(ctx context.Context, collectionID *int64) ([]senderdom.Request, error) {
	const baseQuery = `
		SELECT id, collection_id, name, target_host, service, method, schema_source, metadata, payload, created_at, updated_at
		FROM sender_requests
	`
	query := baseQuery + " ORDER BY updated_at DESC, id DESC"
	args := []any{}
	if collectionID != nil && *collectionID > 0 {
		query = baseQuery + " WHERE collection_id = $1 ORDER BY updated_at DESC, id DESC"
		args = append(args, *collectionID)
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list sender requests")
	}
	defer rows.Close()

	result := make([]senderdom.Request, 0)
	for rows.Next() {
		item, err := scanSenderRequest(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed to read sender requests")
	}

	return result, nil
}

func (r *Repository) CreateRequest(ctx context.Context, params CreateRequestParams) (senderdom.Request, error) {
	if err := validateRequest(params.CollectionID, params.Name, params.TargetHost, params.Service, params.Method, params.SchemaSource); err != nil {
		return senderdom.Request{}, err
	}

	metadataRaw, payloadRaw, err := marshalRequestJSON(params.Metadata, params.Payload)
	if err != nil {
		return senderdom.Request{}, err
	}

	row, err := r.pool.Query(ctx, `
		INSERT INTO sender_requests (
			collection_id, name, target_host, service, method, schema_source, metadata, payload, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NOW(), NOW())
		RETURNING id, collection_id, name, target_host, service, method, schema_source, metadata, payload, created_at, updated_at
	`, params.CollectionID, strings.TrimSpace(params.Name), strings.TrimSpace(params.TargetHost),
		strings.TrimSpace(params.Service), strings.TrimSpace(params.Method), strings.TrimSpace(params.SchemaSource),
		string(metadataRaw), string(payloadRaw))
	if err != nil {
		return senderdom.Request{}, errors.Wrap(err, "failed to create sender request")
	}
	defer row.Close()

	if !row.Next() {
		return senderdom.Request{}, errors.New("failed to create sender request")
	}

	item, scanErr := scanSenderRequest(row)
	if scanErr != nil {
		return senderdom.Request{}, scanErr
	}

	return item, nil
}

func (r *Repository) UpdateRequest(ctx context.Context, id int64, params UpdateRequestParams) (*senderdom.Request, error) {
	if id <= 0 {
		return nil, errors.New("request id is required")
	}

	var (
		collectionID = params.CollectionID
		name         = trimOptionalNonEmpty(params.Name, "request name")
		targetHost   = trimOptionalNonEmpty(params.TargetHost, "target host")
		service      = trimOptionalNonEmpty(params.Service, "service")
		method       = trimOptionalNonEmpty(params.Method, "method")
		schemaSource *string
	)
	if params.SchemaSource != nil {
		normalizedSchemaSource := strings.TrimSpace(*params.SchemaSource)
		if normalizedSchemaSource == "" {
			return nil, errors.New("schema source must not be empty")
		}
		if err := validateSchemaSource(normalizedSchemaSource); err != nil {
			return nil, err
		}
		schemaSource = &normalizedSchemaSource
	}
	if collectionID != nil && *collectionID <= 0 {
		return nil, errors.New("collection id must be positive")
	}

	metadataRaw, payloadRaw, err := marshalOptionalRequestJSON(params.Metadata, params.Payload)
	if err != nil {
		return nil, err
	}

	row, err := r.pool.Query(ctx, `
		UPDATE sender_requests
		SET collection_id = COALESCE($2, collection_id),
		    name = COALESCE($3, name),
		    target_host = COALESCE($4, target_host),
		    service = COALESCE($5, service),
		    method = COALESCE($6, method),
		    schema_source = COALESCE($7, schema_source),
		    metadata = COALESCE($8::jsonb, metadata),
		    payload = COALESCE($9::jsonb, payload),
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, collection_id, name, target_host, service, method, schema_source, metadata, payload, created_at, updated_at
	`, id, collectionID, name, targetHost, service, method, schemaSource, metadataRaw, payloadRaw)
	if err != nil {
		return nil, errors.Wrap(err, "failed to update sender request")
	}
	defer row.Close()

	if !row.Next() {
		return nil, nil
	}

	item, scanErr := scanSenderRequest(row)
	if scanErr != nil {
		return nil, scanErr
	}

	return &item, nil
}

func (r *Repository) DeleteRequest(ctx context.Context, id int64) (bool, error) {
	if id <= 0 {
		return false, nil
	}
	tag, err := r.pool.Exec(ctx, `DELETE FROM sender_requests WHERE id = $1`, id)
	if err != nil {
		return false, errors.Wrap(err, "failed to delete sender request")
	}

	return tag.RowsAffected() > 0, nil
}

func validateRequest(collectionID int64, name, targetHost, service, method, schemaSource string) error {
	if collectionID <= 0 {
		return errors.New("collection id is required")
	}
	if strings.TrimSpace(name) == "" {
		return errors.New("request name is required")
	}
	if strings.TrimSpace(targetHost) == "" {
		return errors.New("target host is required")
	}
	if strings.TrimSpace(service) == "" {
		return errors.New("service is required")
	}
	if strings.TrimSpace(method) == "" {
		return errors.New("method is required")
	}
	if err := validateSchemaSource(schemaSource); err != nil {
		return err
	}

	return nil
}

func validateSchemaSource(source string) error {
	switch strings.TrimSpace(source) {
	case senderdom.SchemaSourceProto, senderdom.SchemaSourceReflection:
		return nil
	default:
		return errors.New("schema source must be proto or reflection")
	}
}

func trimOptionalNonEmpty(value *string, fieldName string) *string {
	if value == nil {
		return nil
	}
	normalized := strings.TrimSpace(*value)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func marshalRequestJSON(metadata map[string]string, payload map[string]any) ([]byte, []byte, error) {
	metadataRaw, err := json.Marshal(metadata)
	if err != nil {
		return nil, nil, errors.Wrap(err, "failed to encode metadata")
	}
	payloadRaw, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, errors.Wrap(err, "failed to encode payload")
	}

	return metadataRaw, payloadRaw, nil
}

func marshalOptionalRequestJSON(metadata *map[string]string, payload *map[string]any) (*string, *string, error) {
	var (
		metadataRaw *string
		payloadRaw  *string
	)
	if metadata != nil {
		bytesValue, err := json.Marshal(*metadata)
		if err != nil {
			return nil, nil, errors.Wrap(err, "failed to encode metadata")
		}
		encoded := string(bytesValue)
		metadataRaw = &encoded
	}
	if payload != nil {
		bytesValue, err := json.Marshal(*payload)
		if err != nil {
			return nil, nil, errors.Wrap(err, "failed to encode payload")
		}
		encoded := string(bytesValue)
		payloadRaw = &encoded
	}

	return metadataRaw, payloadRaw, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanSenderRequest(row scanner) (senderdom.Request, error) {
	var (
		item        senderdom.Request
		metadataRaw []byte
		payloadRaw  []byte
	)
	if err := row.Scan(
		&item.ID,
		&item.CollectionID,
		&item.Name,
		&item.TargetHost,
		&item.Service,
		&item.Method,
		&item.SchemaSource,
		&metadataRaw,
		&payloadRaw,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return senderdom.Request{}, errors.Wrap(err, "failed to scan sender request")
	}

	item.Name = strings.TrimSpace(item.Name)
	item.TargetHost = strings.TrimSpace(item.TargetHost)
	item.Service = strings.TrimSpace(item.Service)
	item.Method = strings.TrimSpace(item.Method)
	item.SchemaSource = strings.TrimSpace(item.SchemaSource)

	if len(metadataRaw) > 0 {
		if err := json.Unmarshal(metadataRaw, &item.Metadata); err != nil {
			return senderdom.Request{}, errors.Wrap(err, "failed to decode sender metadata")
		}
	}
	if item.Metadata == nil {
		item.Metadata = map[string]string{}
	}

	if len(payloadRaw) > 0 {
		if err := json.Unmarshal(payloadRaw, &item.Payload); err != nil {
			return senderdom.Request{}, errors.Wrap(err, "failed to decode sender payload")
		}
	}
	if item.Payload == nil {
		item.Payload = map[string]any{}
	}

	return item, nil
}

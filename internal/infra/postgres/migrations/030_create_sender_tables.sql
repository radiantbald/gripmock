CREATE TABLE IF NOT EXISTS sender_collections (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sender_collections_name_not_empty CHECK (name <> '')
);

CREATE TABLE IF NOT EXISTS sender_requests (
    id BIGSERIAL PRIMARY KEY,
    collection_id BIGINT NOT NULL REFERENCES sender_collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_host TEXT NOT NULL,
    service TEXT NOT NULL,
    method TEXT NOT NULL,
    schema_source TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sender_requests_name_not_empty CHECK (name <> ''),
    CONSTRAINT sender_requests_target_not_empty CHECK (target_host <> ''),
    CONSTRAINT sender_requests_service_not_empty CHECK (service <> ''),
    CONSTRAINT sender_requests_method_not_empty CHECK (method <> ''),
    CONSTRAINT sender_requests_schema_source_valid CHECK (schema_source IN ('proto', 'reflection'))
);

CREATE INDEX IF NOT EXISTS idx_sender_requests_collection_id
    ON sender_requests (collection_id, updated_at DESC, id DESC);

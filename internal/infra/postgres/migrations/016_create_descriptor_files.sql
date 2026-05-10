CREATE TABLE IF NOT EXISTS descriptor_files (
    name TEXT PRIMARY KEY,
    payload BYTEA NOT NULL,
    hash TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_descriptor_files_updated_at ON descriptor_files (updated_at);

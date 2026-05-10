CREATE TABLE IF NOT EXISTS clients (
    client_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_session_id ON clients (session_id);

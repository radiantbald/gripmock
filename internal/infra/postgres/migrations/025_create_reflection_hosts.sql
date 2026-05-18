CREATE TABLE IF NOT EXISTS reflection_hosts (
    id BIGSERIAL PRIMARY KEY,
    host TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reflection_hosts_host_unique UNIQUE (host)
);

CREATE INDEX IF NOT EXISTS idx_reflection_hosts_updated_at ON reflection_hosts (updated_at DESC);

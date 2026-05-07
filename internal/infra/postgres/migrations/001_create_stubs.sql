CREATE TABLE IF NOT EXISTS stubs (
    id BIGSERIAL PRIMARY KEY,
    stub_id UUID NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL,
    method TEXT NOT NULL,
    session TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
    output JSONB NOT NULL DEFAULT '{}'::jsonb,
    effects JSONB NOT NULL DEFAULT '[]'::jsonb,
    source TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stubs_service_method_session ON stubs(service, method, session);
CREATE INDEX IF NOT EXISTS idx_stubs_source ON stubs(source);

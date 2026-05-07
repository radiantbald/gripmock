CREATE TABLE IF NOT EXISTS allowed_phones (
    phone TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    comment TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allowed_phones_active ON allowed_phones(active);

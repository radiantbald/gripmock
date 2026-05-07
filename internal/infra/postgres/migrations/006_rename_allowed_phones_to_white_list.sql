DO $$
BEGIN
    IF to_regclass('public.white_list') IS NULL AND to_regclass('public.allowed_phones') IS NOT NULL THEN
        ALTER TABLE allowed_phones RENAME TO white_list;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS white_list (
    phone TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    comment TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF to_regclass('public.allowed_phones') IS NOT NULL THEN
        INSERT INTO white_list (phone, code, active, comment, expires_at, created_at, updated_at)
        SELECT phone, code, active, comment, expires_at, created_at, updated_at
        FROM allowed_phones
        ON CONFLICT (phone) DO NOTHING;
    END IF;
END $$;

DROP TABLE IF EXISTS allowed_phones;

DO $$
BEGIN
    IF to_regclass('public.idx_allowed_phones_active') IS NOT NULL THEN
        ALTER INDEX idx_allowed_phones_active RENAME TO idx_white_list_active;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_white_list_active ON white_list(active);

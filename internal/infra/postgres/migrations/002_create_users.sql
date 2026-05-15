CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    room TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL DEFAULT '',
    verification_code TEXT NOT NULL DEFAULT '',
    code_expires_at TIMESTAMPTZ,
    last_auth_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'room'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_room ON users(room)';
    END IF;
END $$;

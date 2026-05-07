CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    creator TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_creator ON sessions(creator);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'session'
    ) THEN
        EXECUTE '
            INSERT INTO sessions (name, creator, created_at, updated_at)
            SELECT session, phone, created_at, updated_at
            FROM users
            WHERE session IS NOT NULL AND session <> ''''
            ON CONFLICT (creator) DO UPDATE SET
                name = EXCLUDED.name,
                creator = EXCLUDED.creator,
                updated_at = NOW()
        ';

        EXECUTE 'DROP INDEX IF EXISTS idx_users_session';
        EXECUTE 'ALTER TABLE users DROP COLUMN IF EXISTS session';
    END IF;
END $$;

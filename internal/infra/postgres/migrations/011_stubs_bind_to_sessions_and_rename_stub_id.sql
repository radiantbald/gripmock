DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'stub_id'
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'stubs'
              AND column_name = 'id'
              AND data_type = 'bigint'
        ) THEN
            ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_pkey;
            ALTER TABLE stubs RENAME COLUMN id TO row_id;
        END IF;

        ALTER TABLE stubs RENAME COLUMN stub_id TO id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'session'
          AND data_type = 'text'
    ) THEN
        ALTER TABLE stubs RENAME COLUMN session TO session_legacy;
        ALTER TABLE stubs ADD COLUMN session BIGINT;

        UPDATE stubs
        SET session = (
            SELECT sessions.id
            FROM sessions
            WHERE sessions.name = stubs.session_legacy
            ORDER BY sessions.updated_at DESC, sessions.id DESC
            LIMIT 1
        )
        WHERE btrim(stubs.session_legacy) <> '';

        ALTER TABLE stubs DROP COLUMN session_legacy;
    END IF;

    ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_stub_id_key;
    ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_id_key;
    ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_pkey;

    ALTER TABLE stubs ALTER COLUMN id SET NOT NULL;
    ALTER TABLE stubs ADD CONSTRAINT stubs_pkey PRIMARY KEY (id);

    ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_session_fkey;
    ALTER TABLE stubs
        ADD CONSTRAINT stubs_session_fkey
        FOREIGN KEY (session) REFERENCES sessions(id) ON DELETE CASCADE;

    ALTER TABLE stubs DROP COLUMN IF EXISTS row_id;
END $$;

CREATE INDEX IF NOT EXISTS idx_stubs_service_method_session ON stubs(service, method, session);

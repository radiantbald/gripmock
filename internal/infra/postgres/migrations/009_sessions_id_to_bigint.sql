DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sessions'
          AND column_name = 'id'
          AND data_type <> 'bigint'
    ) THEN
        ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_pkey;
        ALTER TABLE sessions RENAME COLUMN id TO legacy_id;
        ALTER TABLE sessions ADD COLUMN id BIGSERIAL;
        ALTER TABLE sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
        ALTER TABLE sessions DROP COLUMN legacy_id;
    END IF;
END $$;

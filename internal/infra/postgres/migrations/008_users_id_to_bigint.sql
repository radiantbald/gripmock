DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'id'
          AND data_type <> 'bigint'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
        ALTER TABLE users RENAME COLUMN id TO legacy_id;
        ALTER TABLE users ADD COLUMN id BIGSERIAL;
        ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
        ALTER TABLE users DROP COLUMN legacy_id;
    END IF;
END $$;

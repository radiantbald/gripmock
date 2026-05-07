DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_pkey;
        ALTER TABLE stubs RENAME COLUMN id TO stub_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'stub_id'
    ) THEN
        ALTER TABLE stubs ALTER COLUMN stub_id SET NOT NULL;
        ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_stub_id_key;
        ALTER TABLE stubs ADD CONSTRAINT stubs_stub_id_key UNIQUE (stub_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'id'
    ) THEN
        ALTER TABLE stubs ADD COLUMN id BIGSERIAL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND constraint_name = 'stubs_pkey'
          AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE stubs ADD CONSTRAINT stubs_pkey PRIMARY KEY (id);
    END IF;
END $$;

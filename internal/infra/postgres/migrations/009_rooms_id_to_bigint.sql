DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rooms'
          AND column_name = 'id'
          AND data_type <> 'bigint'
    ) THEN
        ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_pkey;
        ALTER TABLE rooms RENAME COLUMN id TO legacy_id;
        ALTER TABLE rooms ADD COLUMN id BIGSERIAL;
        ALTER TABLE rooms ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);
        ALTER TABLE rooms DROP COLUMN legacy_id;
    END IF;
END $$;

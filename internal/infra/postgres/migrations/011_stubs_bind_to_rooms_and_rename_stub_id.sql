DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'room'
          AND data_type = 'text'
    ) THEN
        ALTER TABLE stubs RENAME COLUMN room TO room_legacy;
        ALTER TABLE stubs ADD COLUMN room BIGINT;

        UPDATE stubs
        SET room = (
            SELECT rooms.id
            FROM rooms
            WHERE rooms.name = stubs.room_legacy
            ORDER BY rooms.updated_at DESC, rooms.id DESC
            LIMIT 1
        )
        WHERE btrim(stubs.room_legacy) <> '';

        ALTER TABLE stubs DROP COLUMN room_legacy;
    END IF;

    -- Cleanup UUID-based legacy columns/constraints from old migrations.
    ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_stub_id_key;
    ALTER TABLE stubs DROP COLUMN IF EXISTS stub_id;
    ALTER TABLE stubs DROP COLUMN IF EXISTS legacy_uuid_id;
    ALTER TABLE stubs DROP COLUMN IF EXISTS row_id;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'p'
          AND c.conrelid = 'stubs'::regclass
          AND a.attname = 'id'
    ) THEN
        ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_id_key;
        ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_pkey;
        ALTER TABLE stubs ALTER COLUMN id SET NOT NULL;
        ALTER TABLE stubs ADD CONSTRAINT stubs_pkey PRIMARY KEY (id);
    END IF;

    ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_room_fkey;
    ALTER TABLE stubs
        ADD CONSTRAINT stubs_room_fkey
        FOREIGN KEY (room) REFERENCES rooms(id) ON DELETE CASCADE;
END $$;

CREATE INDEX IF NOT EXISTS idx_stubs_service_method_room ON stubs(service, method, room);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'stub_room_state'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'enabled_stubs'
    ) THEN
        ALTER TABLE stub_room_state RENAME TO enabled_stubs;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'enabled_stubs'
    ) THEN
        CREATE TABLE enabled_stubs (
            stub_id BIGINT NOT NULL REFERENCES stubs(id) ON DELETE CASCADE,
            room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            stub_enabled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            PRIMARY KEY (stub_id, room_id)
        );
    END IF;

    -- Legacy schema could have UUID-based stub_id; migrate to BIGINT via preserved legacy UUID.
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'enabled_stubs'
          AND column_name = 'stub_id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE enabled_stubs ADD COLUMN IF NOT EXISTS stub_id_bigint BIGINT;

        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'stubs'
              AND column_name = 'legacy_uuid_id'
        ) THEN
            UPDATE enabled_stubs AS srs
            SET stub_id_bigint = s.id
            FROM stubs AS s
            WHERE s.legacy_uuid_id IS NOT NULL
              AND srs.stub_id = s.legacy_uuid_id;
        END IF;

        -- Drop orphaned room-state rows that cannot be mapped to numeric stub ids.
        DELETE FROM enabled_stubs WHERE stub_id_bigint IS NULL;

        ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS enabled_stubs_pkey;
        ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS enabled_stubs_stub_id_fkey;
        ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS stub_room_state_pkey;
        ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS stub_room_state_stub_id_fkey;
        ALTER TABLE enabled_stubs DROP COLUMN stub_id;
        ALTER TABLE enabled_stubs RENAME COLUMN stub_id_bigint TO stub_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'enabled_stubs'
          AND column_name = 'enabled'
    ) THEN
        DELETE FROM enabled_stubs WHERE enabled IS NOT TRUE;
        ALTER TABLE enabled_stubs DROP COLUMN enabled;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'enabled_stubs'
          AND column_name = 'created_at'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'enabled_stubs'
          AND column_name = 'stub_enabled_at'
    ) THEN
        ALTER TABLE enabled_stubs RENAME COLUMN created_at TO stub_enabled_at;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'enabled_stubs'
          AND column_name = 'stub_enabled_at'
    ) THEN
        ALTER TABLE enabled_stubs ADD COLUMN stub_enabled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;

    ALTER TABLE enabled_stubs DROP COLUMN IF EXISTS updated_at;

    ALTER TABLE enabled_stubs ALTER COLUMN stub_id SET NOT NULL;
    ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS enabled_stubs_pkey;
    ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS stub_room_state_pkey;
    ALTER TABLE enabled_stubs ADD CONSTRAINT enabled_stubs_pkey PRIMARY KEY (stub_id, room_id);

    ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS enabled_stubs_stub_id_fkey;
    ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS stub_room_state_stub_id_fkey;
    ALTER TABLE enabled_stubs
        ADD CONSTRAINT enabled_stubs_stub_id_fkey
        FOREIGN KEY (stub_id) REFERENCES stubs(id) ON DELETE CASCADE;

    ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS enabled_stubs_room_id_fkey;
    ALTER TABLE enabled_stubs DROP CONSTRAINT IF EXISTS stub_room_state_room_id_fkey;
    ALTER TABLE enabled_stubs
        ADD CONSTRAINT enabled_stubs_room_id_fkey
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
END $$;

DROP INDEX IF EXISTS idx_stub_room_state_room_enabled;
CREATE INDEX IF NOT EXISTS idx_enabled_stubs_room_id
    ON enabled_stubs (room_id);

DO $$
BEGIN
    -- Rename canonical table: sessions -> rooms.
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'sessions'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'rooms'
    ) THEN
        ALTER TABLE sessions RENAME TO rooms;
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'sessions'
    ) AND EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'rooms'
    ) THEN
        -- "rooms" was created separately; keep original "sessions" data by rename.
        ALTER TABLE stubs DROP CONSTRAINT IF EXISTS stubs_room_fkey;
        DROP TABLE rooms;
        ALTER TABLE sessions RENAME TO rooms;
    ELSIF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'rooms'
    ) THEN
        CREATE TABLE rooms (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            creator TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    END IF;

    CREATE INDEX IF NOT EXISTS idx_rooms_creator ON rooms(creator);

    -- Legacy backfill from users column.
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'session'
    ) THEN
        EXECUTE '
            INSERT INTO rooms (name, creator, created_at, updated_at)
            SELECT session, phone, created_at, updated_at
            FROM users
            WHERE session IS NOT NULL AND session <> ''''
        ';

        EXECUTE 'DROP INDEX IF EXISTS idx_users_session';
        EXECUTE 'ALTER TABLE users DROP COLUMN IF EXISTS session';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'room'
    ) THEN
        EXECUTE '
            INSERT INTO rooms (name, creator, created_at, updated_at)
            SELECT room, phone, created_at, updated_at
            FROM users
            WHERE room IS NOT NULL AND room <> ''''
        ';

        EXECUTE 'DROP INDEX IF EXISTS idx_users_room';
        EXECUTE 'ALTER TABLE users DROP COLUMN IF EXISTS room';
    END IF;
END $$;

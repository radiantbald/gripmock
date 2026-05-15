DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rooms'
          AND column_name = 'room_id'
    ) THEN
        EXECUTE 'ALTER TABLE rooms RENAME COLUMN room_id TO id';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rooms'
          AND column_name = 'room_name'
    ) THEN
        EXECUTE 'ALTER TABLE rooms RENAME COLUMN room_name TO name';
    END IF;
END $$;

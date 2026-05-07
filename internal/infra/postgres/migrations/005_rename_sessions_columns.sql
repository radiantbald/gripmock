DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sessions'
          AND column_name = 'session_id'
    ) THEN
        EXECUTE 'ALTER TABLE sessions RENAME COLUMN session_id TO id';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sessions'
          AND column_name = 'session_name'
    ) THEN
        EXECUTE 'ALTER TABLE sessions RENAME COLUMN session_name TO name';
    END IF;
END $$;

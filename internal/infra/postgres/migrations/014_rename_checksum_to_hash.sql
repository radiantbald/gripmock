DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'protofiles'
          AND column_name = 'checksum'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'protofiles'
          AND column_name = 'hash'
    ) THEN
        EXECUTE 'ALTER TABLE protofiles RENAME COLUMN checksum TO hash';
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'protofile_history'
          AND column_name = 'checksum'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'protofile_history'
          AND column_name = 'hash'
    ) THEN
        EXECUTE 'ALTER TABLE protofile_history RENAME COLUMN checksum TO hash';
    END IF;
END;
$$;

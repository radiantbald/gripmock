DO $$
DECLARE
    unique_constraint RECORD;
    unique_index RECORD;
BEGIN
    -- Keep uniqueness only on primary key (id).
    FOR unique_constraint IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'rooms'
          AND c.contype = 'u'
    LOOP
        EXECUTE format('ALTER TABLE rooms DROP CONSTRAINT IF EXISTS %I', unique_constraint.conname);
    END LOOP;

    -- Drop non-primary unique indexes left by legacy migrations.
    FOR unique_index IN
        SELECT i.relname AS index_name
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_index ix ON ix.indrelid = t.oid
        JOIN pg_class i ON i.oid = ix.indexrelid
        WHERE n.nspname = 'public'
          AND t.relname = 'rooms'
          AND ix.indisunique
          AND NOT ix.indisprimary
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', unique_index.index_name);
    END LOOP;

    -- Explicit names from old releases (safe no-op if absent).
    DROP INDEX IF EXISTS idx_rooms_creator;
    DROP INDEX IF EXISTS idx_sessions_creator;
    DROP INDEX IF EXISTS idx_rooms_creator_name;
END $$;

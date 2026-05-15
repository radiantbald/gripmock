CREATE TABLE IF NOT EXISTS stubs (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL,
    method TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
    output JSONB NOT NULL DEFAULT '{}'::jsonb,
    effects JSONB NOT NULL DEFAULT '[]'::jsonb,
    source TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    -- Compatibility for legacy databases where "stubs" already existed
    -- with older column set and migration history table was absent.
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'room'
    ) THEN
        ALTER TABLE stubs ADD COLUMN room TEXT NOT NULL DEFAULT '';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'priority'
    ) THEN
        ALTER TABLE stubs ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stubs'
          AND column_name = 'enabled'
    ) THEN
        ALTER TABLE stubs ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stubs_service_method_room ON stubs(service, method, room);
CREATE INDEX IF NOT EXISTS idx_stubs_source ON stubs(source);

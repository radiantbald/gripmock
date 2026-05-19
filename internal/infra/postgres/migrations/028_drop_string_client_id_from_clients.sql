DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'clients'
          AND column_name = 'client_id'
    ) THEN
        EXECUTE 'UPDATE clients SET fingerprint = client_id WHERE (fingerprint = '''' OR fingerprint IS NULL) AND client_id <> ''''';
    END IF;
END $$;

UPDATE clients
SET fingerprint = CONCAT(COALESCE(peer_host, ''), '|', COALESCE(user_agent, ''))
WHERE (fingerprint = '' OR fingerprint IS NULL)
  AND (COALESCE(peer_host, '') <> '' OR COALESCE(user_agent, '') <> '');

DELETE FROM clients
WHERE fingerprint = '' OR fingerprint IS NULL;

DO $$
DECLARE
    current_pk_name text;
BEGIN
    SELECT conname
    INTO current_pk_name
    FROM pg_constraint
    WHERE conrelid = 'clients'::regclass
      AND contype = 'p'
    LIMIT 1;

    IF current_pk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE clients DROP CONSTRAINT %I', current_pk_name);
    END IF;
END $$;

ALTER TABLE clients
    DROP CONSTRAINT IF EXISTS clients_client_id_not_empty;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_fingerprint_unique
    ON clients (fingerprint);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clients_fingerprint_not_empty'
    ) THEN
        ALTER TABLE clients
            ADD CONSTRAINT clients_fingerprint_not_empty CHECK (fingerprint <> '');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'clients'::regclass
          AND contype = 'p'
    ) THEN
        ALTER TABLE clients
            ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
    END IF;
END $$;

ALTER TABLE clients
    DROP COLUMN IF EXISTS client_id;

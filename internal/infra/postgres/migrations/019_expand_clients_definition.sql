ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS peer_host TEXT NOT NULL DEFAULT '';

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS fingerprint TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'clients'
          AND column_name = 'client_id'
    ) THEN
        EXECUTE 'UPDATE clients SET fingerprint = client_id WHERE fingerprint = '''' AND client_id <> ''''';
        EXECUTE 'UPDATE clients SET peer_host = split_part(client_id, ''|'', 1) WHERE peer_host = '''' AND client_id <> ''''';
        EXECUTE 'UPDATE clients SET user_agent = split_part(client_id, ''|'', 2) WHERE user_agent = '''' AND position(''|'' IN client_id) > 0';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_peer_host ON clients (peer_host);
CREATE INDEX IF NOT EXISTS idx_clients_fingerprint ON clients (fingerprint);

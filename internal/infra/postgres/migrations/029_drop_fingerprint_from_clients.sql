DROP INDEX IF EXISTS idx_clients_fingerprint_unique;
DROP INDEX IF EXISTS idx_clients_fingerprint;

ALTER TABLE clients
    DROP CONSTRAINT IF EXISTS clients_fingerprint_not_empty;

ALTER TABLE clients
    DROP COLUMN IF EXISTS fingerprint;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_peer_user_agent_unique
    ON clients (peer_host, user_agent);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clients_peer_user_agent_not_empty'
    ) THEN
        ALTER TABLE clients
            ADD CONSTRAINT clients_peer_user_agent_not_empty
                CHECK (peer_host <> '' OR user_agent <> '');
    END IF;
END $$;

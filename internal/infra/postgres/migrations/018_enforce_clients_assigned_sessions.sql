DELETE FROM clients
WHERE client_id = '' OR session_id = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clients_client_id_not_empty'
    ) THEN
        ALTER TABLE clients
            ADD CONSTRAINT clients_client_id_not_empty CHECK (client_id <> '');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clients_session_id_not_empty'
    ) THEN
        ALTER TABLE clients
            ADD CONSTRAINT clients_session_id_not_empty CHECK (session_id <> '');
    END IF;
END $$;

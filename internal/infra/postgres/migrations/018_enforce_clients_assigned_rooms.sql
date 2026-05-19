DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'clients'
          AND column_name = 'client_id'
    ) THEN
        EXECUTE 'DELETE FROM clients WHERE client_id = '''' OR room_id = ''''';
    ELSE
        EXECUTE 'DELETE FROM clients WHERE room_id = ''''';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'clients'
          AND column_name = 'client_id'
    ) AND NOT EXISTS (
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
        WHERE conname = 'clients_room_id_not_empty'
    ) THEN
        ALTER TABLE clients
            ADD CONSTRAINT clients_room_id_not_empty CHECK (room_id <> '');
    END IF;
END $$;

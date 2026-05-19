ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

UPDATE clients
SET name = "user"
WHERE name = '' AND "user" <> '';

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);

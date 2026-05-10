ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS "user" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_clients_user ON clients ("user");

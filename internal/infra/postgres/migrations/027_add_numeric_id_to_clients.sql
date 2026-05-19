ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS id BIGINT;

CREATE SEQUENCE IF NOT EXISTS clients_id_seq;

ALTER TABLE clients
    ALTER COLUMN id SET DEFAULT nextval('clients_id_seq');

UPDATE clients
SET id = nextval('clients_id_seq')
WHERE id IS NULL;

SELECT setval('clients_id_seq', COALESCE((SELECT MAX(id) FROM clients), 1), true);

ALTER TABLE clients
    ALTER COLUMN id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_id ON clients (id);

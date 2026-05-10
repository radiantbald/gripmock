ALTER TABLE protofiles
    ADD COLUMN IF NOT EXISTS payload BYTEA;

ALTER TABLE protofiles
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '';

UPDATE protofiles AS p
SET
    payload = d.payload,
    hash = COALESCE(NULLIF(d.hash, ''), p.hash),
    source = COALESCE(NULLIF(d.source, ''), p.source),
    updated_at = GREATEST(p.updated_at, d.updated_at)
FROM descriptor_files AS d
WHERE d.name = p.name
  AND (p.payload IS NULL OR p.source = '');

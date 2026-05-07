ALTER TABLE users
    DROP COLUMN IF EXISTS client_id,
    DROP COLUMN IF EXISTS verification_code,
    DROP COLUMN IF EXISTS code_expires_at,
    DROP COLUMN IF EXISTS last_auth_at;

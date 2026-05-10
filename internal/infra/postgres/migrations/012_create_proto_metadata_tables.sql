CREATE TABLE IF NOT EXISTS protofiles (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    hash TEXT NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT protofiles_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS packages (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    protofile_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT packages_protofile_fkey FOREIGN KEY (protofile_id) REFERENCES protofiles (id) ON DELETE CASCADE,
    CONSTRAINT packages_protofile_name_key UNIQUE (protofile_id, name)
);

CREATE TABLE IF NOT EXISTS services (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    package_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT services_package_fkey FOREIGN KEY (package_id) REFERENCES packages (id) ON DELETE CASCADE,
    CONSTRAINT services_package_name_key UNIQUE (package_id, name)
);

CREATE TABLE IF NOT EXISTS methods (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    service_id BIGINT NOT NULL,
    request_type TEXT NOT NULL,
    response_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT methods_service_fkey FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE,
    CONSTRAINT methods_service_name_key UNIQUE (service_id, name)
);

CREATE TABLE IF NOT EXISTS protofile_history (
    id BIGSERIAL PRIMARY KEY,
    protofile_id BIGINT,
    name TEXT NOT NULL,
    version BIGINT NOT NULL,
    hash TEXT NOT NULL,
    action TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT protofile_history_protofile_fkey FOREIGN KEY (protofile_id) REFERENCES protofiles (id) ON DELETE SET NULL,
    CONSTRAINT protofile_history_action_check CHECK (action IN ('created', 'replaced', 'noop'))
);

CREATE INDEX IF NOT EXISTS idx_packages_protofile ON packages (protofile_id);
CREATE INDEX IF NOT EXISTS idx_services_package ON services (package_id);
CREATE INDEX IF NOT EXISTS idx_methods_service ON methods (service_id);
CREATE INDEX IF NOT EXISTS idx_protofile_history_protofile ON protofile_history (protofile_id);
CREATE INDEX IF NOT EXISTS idx_protofile_history_created_at ON protofile_history (created_at);

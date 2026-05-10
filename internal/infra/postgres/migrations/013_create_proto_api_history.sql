CREATE TABLE IF NOT EXISTS proto_api_history (
    id BIGSERIAL PRIMARY KEY,
    protofile_history_id BIGINT NOT NULL,
    protofile_id BIGINT,
    protofile_name TEXT NOT NULL,
    protofile_version BIGINT NOT NULL,
    event_type TEXT NOT NULL,
    package_name TEXT NOT NULL,
    service_name TEXT,
    method_name TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT proto_api_history_protofile_history_fkey FOREIGN KEY (protofile_history_id) REFERENCES protofile_history (id) ON DELETE CASCADE,
    CONSTRAINT proto_api_history_protofile_fkey FOREIGN KEY (protofile_id) REFERENCES protofiles (id) ON DELETE SET NULL,
    CONSTRAINT proto_api_history_event_type_check CHECK (event_type IN (
        'service_added',
        'service_removed',
        'method_added',
        'method_removed',
        'method_signature_changed'
    ))
);

CREATE INDEX IF NOT EXISTS idx_proto_api_history_file_version ON proto_api_history (protofile_id, protofile_version);
CREATE INDEX IF NOT EXISTS idx_proto_api_history_event_type ON proto_api_history (event_type);
CREATE INDEX IF NOT EXISTS idx_proto_api_history_created_at ON proto_api_history (created_at);

CREATE TABLE tabular.import_operations (
  id text PRIMARY KEY,
  command_id text NOT NULL,
  request_digest text NOT NULL,
  actor_identity_id text NOT NULL REFERENCES tabular.identities(id),
  session_id text NOT NULL,
  history_scope_id text NOT NULL,
  connection_id text NOT NULL,
  database_oid oid NOT NULL,
  requesting_role_oid oid NOT NULL,
  requesting_role_name name NOT NULL,
  identity_generation bigint NOT NULL,
  mapping_generation bigint NOT NULL,
  allowed_role_id text NOT NULL REFERENCES tabular.allowed_roles(id),
  role_generation bigint NOT NULL,
  schema_id text NOT NULL REFERENCES tabular.catalog_schemas(id),
  namespace_oid oid NOT NULL,
  schema_name name NOT NULL,
  owner_role_oid oid NOT NULL,
  owner_role_name name NOT NULL,
  source_kind text NOT NULL,
  source_name text NOT NULL,
  source_media_type text NOT NULL,
  source_size bigint NOT NULL,
  source_sha256 text,
  source_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_fingerprint text,
  total_chunks integer NOT NULL,
  received_chunks integer NOT NULL DEFAULT 0,
  selected_sheet text,
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapping_fingerprint text,
  preview jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  column_count integer NOT NULL DEFAULT 0,
  issue_count integer NOT NULL DEFAULT 0,
  file_display_name text,
  table_name name,
  confirmation_hash text,
  state text NOT NULL DEFAULT 'initiated',
  result_summary jsonb,
  error_summary jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  committed_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT import_operations_id_format CHECK (id ~ '^imp_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT import_operations_command_format CHECK (command_id ~ '^cmd_[A-Za-z0-9_-]{8,96}$'),
  CONSTRAINT import_operations_request_digest CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT import_operations_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT import_operations_source_kind CHECK (source_kind IN ('csv', 'xlsx', 'google-sheets')),
  CONSTRAINT import_operations_source_name CHECK (
    source_name = btrim(source_name) AND length(source_name) BETWEEN 1 AND 255
    AND source_name !~ '[[:cntrl:]]'
  ),
  CONSTRAINT import_operations_source_media_type CHECK (
    source_media_type = btrim(source_media_type)
    AND length(source_media_type) BETWEEN 1 AND 160
    AND source_media_type !~ '[[:cntrl:]]'
  ),
  CONSTRAINT import_operations_source_bounds CHECK (
    source_size BETWEEN 0 AND 8388608
    AND total_chunks BETWEEN 0 AND 64
    AND received_chunks BETWEEN 0 AND total_chunks
  ),
  CONSTRAINT import_operations_hashes CHECK (
    (source_sha256 IS NULL OR source_sha256 ~ '^[a-f0-9]{64}$')
    AND (source_fingerprint IS NULL OR source_fingerprint ~ '^[a-f0-9]{64}$')
    AND (mapping_fingerprint IS NULL OR mapping_fingerprint ~ '^[a-f0-9]{64}$')
    AND (confirmation_hash IS NULL OR confirmation_hash ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT import_operations_json_shapes CHECK (
    jsonb_typeof(source_options) = 'object'
    AND jsonb_typeof(headers) = 'array'
    AND jsonb_typeof(mapping) = 'array'
    AND jsonb_typeof(preview) = 'array'
    AND jsonb_typeof(warnings) = 'array'
    AND (result_summary IS NULL OR jsonb_typeof(result_summary) = 'object')
    AND (error_summary IS NULL OR jsonb_typeof(error_summary) = 'object')
  ),
  CONSTRAINT import_operations_counts CHECK (
    row_count BETWEEN 0 AND 50000
    AND column_count BETWEEN 0 AND 200
    AND issue_count BETWEEN 0 AND 10000
  ),
  CONSTRAINT import_operations_generations CHECK (
    identity_generation > 0 AND mapping_generation > 0 AND role_generation > 0
  ),
  CONSTRAINT import_operations_identity_names CHECK (
    (file_display_name IS NULL OR (
      file_display_name = btrim(file_display_name)
      AND length(file_display_name) BETWEEN 1 AND 200
    ))
  ),
  CONSTRAINT import_operations_state CHECK (state IN (
    'initiated', 'uploading', 'preview', 'ready', 'confirmed',
    'committing', 'committed', 'cancelled', 'failed'
  )),
  CONSTRAINT import_operations_version CHECK (version > 0),
  CONSTRAINT import_operations_expiry CHECK (created_at < expires_at),
  CONSTRAINT import_operations_command_unique UNIQUE (
    actor_identity_id, connection_id, command_id
  )
);

CREATE INDEX import_operations_owner_state_idx
  ON tabular.import_operations (
    actor_identity_id, session_id, history_scope_id, state, updated_at DESC, id
  );

CREATE INDEX import_operations_worker_idx
  ON tabular.import_operations (state, confirmed_at, id)
  WHERE state IN ('confirmed', 'committing');

CREATE TABLE tabular.google_oauth_states (
  state_hash text PRIMARY KEY,
  actor_identity_id text NOT NULL REFERENCES tabular.identities(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  history_scope_id text NOT NULL,
  connection_id text NOT NULL,
  return_path text NOT NULL,
  verifier_ciphertext bytea,
  verifier_iv bytea,
  verifier_tag bytea,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT google_oauth_states_session FOREIGN KEY (
    session_id, actor_identity_id, connection_id, history_scope_id
  ) REFERENCES tabular.browser_sessions (
    id, identity_id, connection_id, history_scope_id
  ) ON DELETE CASCADE,
  CONSTRAINT google_oauth_states_hash CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT google_oauth_states_connection CHECK (
    connection_id = btrim(connection_id) AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT google_oauth_states_return_path CHECK (
    return_path = btrim(return_path) AND return_path LIKE '/pages/import.html%'
    AND length(return_path) BETWEEN 18 AND 500 AND return_path !~ '[[:cntrl:]]'
  ),
  CONSTRAINT google_oauth_states_expiry CHECK (created_at < expires_at),
  CONSTRAINT google_oauth_states_secret_state CHECK (
    (consumed_at IS NULL
      AND verifier_ciphertext IS NOT NULL AND octet_length(verifier_ciphertext) > 0
      AND octet_length(verifier_iv) = 12 AND octet_length(verifier_tag) = 16)
    OR
    (consumed_at IS NOT NULL
      AND verifier_ciphertext IS NULL AND verifier_iv IS NULL AND verifier_tag IS NULL)
  )
);

CREATE INDEX google_oauth_states_expiry_idx
  ON tabular.google_oauth_states (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE tabular.google_connections (
  id text PRIMARY KEY,
  actor_identity_id text NOT NULL REFERENCES tabular.identities(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  history_scope_id text NOT NULL,
  connection_id text NOT NULL,
  access_ciphertext bytea,
  access_iv bytea,
  access_tag bytea,
  refresh_ciphertext bytea,
  refresh_iv bytea,
  refresh_tag bytea,
  scope text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  revoked_at timestamptz,
  revoke_reason text,
  CONSTRAINT google_connections_session FOREIGN KEY (
    session_id, actor_identity_id, connection_id, history_scope_id
  ) REFERENCES tabular.browser_sessions (
    id, identity_id, connection_id, history_scope_id
  ) ON DELETE CASCADE,
  CONSTRAINT google_connections_id CHECK (id ~ '^gconn_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT google_connections_binding UNIQUE (
    actor_identity_id, session_id, history_scope_id, connection_id
  ),
  CONSTRAINT google_connections_scope CHECK (
    scope = 'https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/spreadsheets.readonly'
  ),
  CONSTRAINT google_connections_connection CHECK (
    connection_id = btrim(connection_id) AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT google_connections_refresh_secret CHECK (
    (refresh_ciphertext IS NULL AND refresh_iv IS NULL AND refresh_tag IS NULL)
    OR
    (refresh_ciphertext IS NOT NULL AND octet_length(refresh_ciphertext) > 0
      AND octet_length(refresh_iv) = 12 AND octet_length(refresh_tag) = 16)
  ),
  CONSTRAINT google_connections_active_secret CHECK (
    (revoked_at IS NULL AND revoke_reason IS NULL
      AND access_ciphertext IS NOT NULL AND octet_length(access_ciphertext) > 0
      AND octet_length(access_iv) = 12 AND octet_length(access_tag) = 16)
    OR
    (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL
      AND access_ciphertext IS NULL AND access_iv IS NULL AND access_tag IS NULL
      AND refresh_ciphertext IS NULL AND refresh_iv IS NULL AND refresh_tag IS NULL)
  )
);

CREATE INDEX google_connections_active_idx
  ON tabular.google_connections (
    actor_identity_id, session_id, history_scope_id, connection_id
  ) WHERE revoked_at IS NULL;

CREATE TABLE tabular.import_source_chunks (
  import_id text NOT NULL REFERENCES tabular.import_operations(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  byte_count integer NOT NULL,
  chunk_sha256 text NOT NULL,
  source_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (import_id, chunk_index),
  CONSTRAINT import_source_chunks_index CHECK (chunk_index BETWEEN 0 AND 63),
  CONSTRAINT import_source_chunks_bounds CHECK (
    byte_count BETWEEN 0 AND 262144 AND octet_length(source_bytes) = byte_count
  ),
  CONSTRAINT import_source_chunks_hash CHECK (chunk_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE TABLE tabular.import_rows (
  import_id text NOT NULL REFERENCES tabular.import_operations(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  source_values jsonb NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (import_id, row_number),
  CONSTRAINT import_rows_number CHECK (row_number BETWEEN 1 AND 50001),
  CONSTRAINT import_rows_values_array CHECK (jsonb_typeof(source_values) = 'array'),
  CONSTRAINT import_rows_provenance_object CHECK (jsonb_typeof(provenance) = 'object')
);

CREATE TABLE tabular.import_row_issues (
  import_id text NOT NULL REFERENCES tabular.import_operations(id) ON DELETE CASCADE,
  issue_number integer NOT NULL,
  row_number integer,
  column_number integer,
  code text NOT NULL,
  message text NOT NULL,
  source_token text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (import_id, issue_number),
  CONSTRAINT import_row_issues_number CHECK (issue_number BETWEEN 1 AND 10000),
  CONSTRAINT import_row_issues_row CHECK (row_number IS NULL OR row_number BETWEEN 1 AND 50001),
  CONSTRAINT import_row_issues_column CHECK (column_number IS NULL OR column_number BETWEEN 1 AND 200),
  CONSTRAINT import_row_issues_code CHECK (code ~ '^[a-z][a-z0-9_-]{0,62}$'),
  CONSTRAINT import_row_issues_message CHECK (
    length(message) BETWEEN 1 AND 1000 AND message !~ '[[:cntrl:]]'
  )
);

CREATE TABLE tabular.import_commits (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id text NOT NULL UNIQUE REFERENCES tabular.import_operations(id),
  actor_identity_id text NOT NULL REFERENCES tabular.identities(id),
  session_id text NOT NULL,
  history_scope_id text NOT NULL,
  connection_id text NOT NULL,
  source_fingerprint text NOT NULL,
  mapping_fingerprint text NOT NULL,
  target_file_id text NOT NULL REFERENCES tabular.catalog_objects(id),
  target_relation_oid oid NOT NULL,
  affected_row_count integer NOT NULL,
  affected_column_count integer NOT NULL,
  result_summary jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT import_commits_hashes CHECK (
    source_fingerprint ~ '^[a-f0-9]{64}$'
    AND mapping_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT import_commits_counts CHECK (
    affected_row_count BETWEEN 0 AND 50000
    AND affected_column_count BETWEEN 1 AND 200
  ),
  CONSTRAINT import_commits_result_object CHECK (jsonb_typeof(result_summary) = 'object')
);

COMMENT ON TABLE tabular.import_operations IS
  'Session-bound, fingerprinted import staging and confirmation records; target mutation is worker-only';
COMMENT ON TABLE tabular.import_source_chunks IS
  'Bounded, ordered binary upload chunks retained only for the import operation lifetime';
COMMENT ON TABLE tabular.import_rows IS
  'Exact source tokens staged before any target PostgreSQL mutation';
COMMENT ON TABLE tabular.import_commits IS
  'One transactional capability journal record for each atomic import commit';
COMMENT ON TABLE tabular.google_oauth_states IS
  'One-time, expiring Google OAuth PKCE state bound to one browser session and encrypted at rest';
COMMENT ON TABLE tabular.google_connections IS
  'Session-bound Google readonly credentials encrypted with application-managed AES-256-GCM';

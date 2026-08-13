CREATE TABLE tabular.file_ddl_requests (
  id text PRIMARY KEY,
  command_id text NOT NULL,
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
  action_type text NOT NULL,
  request_digest text NOT NULL,
  action_payload jsonb NOT NULL,
  expected_context jsonb NOT NULL,
  confirmation_hash text NOT NULL,
  state text NOT NULL DEFAULT 'planned',
  result_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  applied_at timestamptz,
  CONSTRAINT file_ddl_requests_id_format CHECK (id ~ '^ddl_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT file_ddl_requests_command_format CHECK (command_id ~ '^cmd_[A-Za-z0-9_-]{8,96}$'),
  CONSTRAINT file_ddl_requests_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT file_ddl_requests_action_type CHECK (
    action_type IN (
      'file.create', 'file.rename', 'file.drop',
      'column.create', 'column.configure', 'column.drop',
      'key.create', 'relation.create', 'hidden.install', 'json.promote'
    )
  ),
  CONSTRAINT file_ddl_requests_digest_format CHECK (
    request_digest ~ '^[a-f0-9]{64}$'
    AND confirmation_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT file_ddl_requests_payload_object CHECK (
    jsonb_typeof(action_payload) = 'object'
    AND jsonb_typeof(expected_context) = 'object'
  ),
  CONSTRAINT file_ddl_requests_state CHECK (state IN ('planned', 'confirmed', 'applied')),
  CONSTRAINT file_ddl_requests_generations CHECK (
    identity_generation > 0 AND mapping_generation > 0 AND role_generation > 0
  ),
  CONSTRAINT file_ddl_requests_expiry CHECK (created_at < expires_at),
  CONSTRAINT file_ddl_requests_state_times CHECK (
    (state = 'planned' AND confirmed_at IS NULL AND applied_at IS NULL AND result_summary IS NULL)
    OR (state = 'confirmed' AND confirmed_at IS NOT NULL AND applied_at IS NULL AND result_summary IS NULL)
    OR (state = 'applied' AND confirmed_at IS NOT NULL AND applied_at IS NOT NULL
      AND jsonb_typeof(result_summary) = 'object')
  ),
  CONSTRAINT file_ddl_requests_command_unique UNIQUE (
    actor_identity_id, connection_id, command_id
  )
);

CREATE INDEX file_ddl_requests_pending_idx
  ON tabular.file_ddl_requests (state, expires_at, created_at, id);

CREATE TABLE tabular.file_metadata (
  object_id text PRIMARY KEY REFERENCES tabular.catalog_objects(id),
  display_name text NOT NULL,
  physical_name_overridden boolean NOT NULL DEFAULT false,
  metadata_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT file_metadata_display_name CHECK (
    display_name = btrim(display_name) AND length(display_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT file_metadata_version CHECK (metadata_version > 0)
);

CREATE TABLE tabular.column_metadata (
  column_id text PRIMARY KEY,
  object_id text NOT NULL REFERENCES tabular.catalog_objects(id),
  catalog_column_id text REFERENCES tabular.catalog_columns(id),
  storage_kind text NOT NULL DEFAULT 'postgresql',
  display_name text NOT NULL,
  field_kind text NOT NULL,
  format_kind text NOT NULL,
  field_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  format_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  hidden boolean NOT NULL DEFAULT false,
  hidden_purpose text,
  metadata_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT column_metadata_display_name CHECK (
    display_name = btrim(display_name) AND length(display_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT column_metadata_id_format CHECK (column_id ~ '^col_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT column_metadata_storage CHECK (
    (storage_kind = 'postgresql' AND catalog_column_id IS NOT NULL)
    OR (storage_kind = 'unstructured-json' AND catalog_column_id IS NULL AND NOT hidden)
  ),
  CONSTRAINT column_metadata_field_format CHECK (
    field_kind ~ '^[a-z][a-z0-9-]{0,62}$'
    AND format_kind ~ '^[a-z][a-z0-9-]{0,62}$'
  ),
  CONSTRAINT column_metadata_config_object CHECK (jsonb_typeof(field_config) = 'object'),
  CONSTRAINT column_metadata_format_config_object CHECK (jsonb_typeof(format_config) = 'object'),
  CONSTRAINT column_metadata_hidden_purpose CHECK (
    (NOT hidden AND hidden_purpose IS NULL)
    OR (hidden AND hidden_purpose IN (
      'row-id', 'row-incarnation', 'row-version', 'unstructured-json', 'shared-rank'
    ))
  ),
  CONSTRAINT column_metadata_version CHECK (metadata_version > 0)
);

CREATE UNIQUE INDEX column_metadata_hidden_owner
  ON tabular.column_metadata (object_id, hidden_purpose)
  WHERE hidden_purpose IS NOT NULL;

CREATE UNIQUE INDEX column_metadata_catalog_binding
  ON tabular.column_metadata (catalog_column_id)
  WHERE catalog_column_id IS NOT NULL;

CREATE TABLE tabular.file_managed_constraints (
  id text PRIMARY KEY,
  object_id text NOT NULL REFERENCES tabular.catalog_objects(id),
  constraint_oid oid NOT NULL,
  physical_name name NOT NULL,
  constraint_kind text NOT NULL,
  source_column_ids jsonb NOT NULL,
  target_object_id text REFERENCES tabular.catalog_objects(id),
  target_column_ids jsonb,
  created_by_request_id text NOT NULL REFERENCES tabular.file_ddl_requests(id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT file_managed_constraints_id_format CHECK (id ~ '^constraint_[A-Za-z0-9_-]{20,64}$'),
  CONSTRAINT file_managed_constraints_kind CHECK (
    constraint_kind IN ('primary-key', 'unique', 'foreign-key')
  ),
  CONSTRAINT file_managed_constraints_columns CHECK (
    jsonb_typeof(source_column_ids) = 'array'
    AND (target_column_ids IS NULL OR jsonb_typeof(target_column_ids) = 'array')
  ),
  CONSTRAINT file_managed_constraints_target CHECK (
    (constraint_kind = 'foreign-key' AND target_object_id IS NOT NULL AND target_column_ids IS NOT NULL)
    OR (constraint_kind <> 'foreign-key' AND target_object_id IS NULL AND target_column_ids IS NULL)
  ),
  CONSTRAINT file_managed_constraints_pg_identity UNIQUE (object_id, constraint_oid)
);

CREATE TABLE tabular.file_ddl_versions (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id text NOT NULL UNIQUE REFERENCES tabular.file_ddl_requests(id),
  connection_id text NOT NULL,
  database_oid oid NOT NULL,
  action_type text NOT NULL,
  request_digest text NOT NULL,
  requesting_role_oid oid NOT NULL,
  applied_by name NOT NULL DEFAULT current_user,
  target_object_id text REFERENCES tabular.catalog_objects(id),
  result_summary jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT file_ddl_versions_digest_format CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT file_ddl_versions_result_object CHECK (jsonb_typeof(result_summary) = 'object')
);

COMMENT ON TABLE tabular.file_ddl_requests IS
  'Session-bound owner-confirmed structured DDL plans; never executable by the web process';
COMMENT ON TABLE tabular.file_ddl_versions IS
  'Transactional record of migrator-applied file DDL; one row commits with each successful change';
COMMENT ON TABLE tabular.file_metadata IS
  'Friendly file labels bound to reconciled PostgreSQL object identity';
COMMENT ON TABLE tabular.column_metadata IS
  'Friendly field and format metadata, including explicitly owned hidden columns';
COMMENT ON TABLE tabular.file_managed_constraints IS
  'Native PostgreSQL constraints created and tracked by confirmed Tabular DDL actions';

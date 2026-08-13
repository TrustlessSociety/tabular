CREATE TABLE tabular.identities (
  id text PRIMARY KEY,
  provider text NOT NULL,
  issuer text NOT NULL,
  provider_subject text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'active',
  identity_generation bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_authenticated_at timestamptz,
  CONSTRAINT identities_id_format CHECK (id ~ '^id_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT identities_provider_format CHECK (
    provider = btrim(provider)
    AND provider ~ '^[a-z][a-z0-9._-]{0,62}$'
  ),
  CONSTRAINT identities_subject_format CHECK (
    provider_subject = btrim(provider_subject)
    AND length(provider_subject) BETWEEN 1 AND 512
    AND provider_subject !~ '[[:cntrl:]]'
  ),
  CONSTRAINT identities_issuer_format CHECK (
    issuer = btrim(issuer)
    AND length(issuer) BETWEEN 1 AND 512
    AND issuer !~ '[[:cntrl:]]'
  ),
  CONSTRAINT identities_display_name_format CHECK (
    display_name IS NULL
    OR (
      display_name = btrim(display_name)
      AND length(display_name) BETWEEN 1 AND 200
      AND display_name !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT identities_status CHECK (status IN ('active', 'disabled', 'revoked')),
  CONSTRAINT identities_generation CHECK (identity_generation > 0),
  CONSTRAINT identities_provider_subject_unique UNIQUE (provider, issuer, provider_subject)
);

CREATE TABLE tabular.allowed_roles (
  id text PRIMARY KEY,
  connection_id text NOT NULL,
  database_oid oid NOT NULL,
  role_oid oid NOT NULL,
  role_name name NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  role_generation bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT allowed_roles_id_format CHECK (id ~ '^role_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT allowed_roles_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT allowed_roles_generation CHECK (role_generation > 0),
  CONSTRAINT allowed_roles_scope_unique UNIQUE (connection_id, database_oid, role_oid)
);

CREATE TABLE tabular.identity_role_mappings (
  identity_id text NOT NULL REFERENCES tabular.identities(id) ON DELETE CASCADE,
  connection_id text NOT NULL,
  allowed_role_id text NOT NULL REFERENCES tabular.allowed_roles(id),
  mapping_generation bigint NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (identity_id, connection_id),
  CONSTRAINT identity_role_mappings_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT identity_role_mappings_generation CHECK (mapping_generation > 0)
);

CREATE TABLE tabular.browser_sessions (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL UNIQUE,
  identity_id text NOT NULL REFERENCES tabular.identities(id) ON DELETE CASCADE,
  identity_generation bigint NOT NULL,
  connection_id text NOT NULL,
  allowed_role_id text NOT NULL REFERENCES tabular.allowed_roles(id),
  role_oid oid NOT NULL,
  mapping_generation bigint NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  rotated_from_id text REFERENCES tabular.browser_sessions(id),
  replaced_by_id text REFERENCES tabular.browser_sessions(id),
  CONSTRAINT browser_sessions_id_format CHECK (id ~ '^sess_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT browser_sessions_token_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT browser_sessions_csrf_hash_format CHECK (csrf_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT browser_sessions_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT browser_sessions_identity_generation CHECK (identity_generation > 0),
  CONSTRAINT browser_sessions_mapping_generation CHECK (mapping_generation > 0),
  CONSTRAINT browser_sessions_revocation_state CHECK (
    (revoked_at IS NULL AND revoke_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
  ),
  CONSTRAINT browser_sessions_expiry_order CHECK (
    issued_at <= last_seen_at
    AND last_seen_at < idle_expires_at
    AND idle_expires_at <= absolute_expires_at
  )
);

CREATE INDEX browser_sessions_identity_active_idx
  ON tabular.browser_sessions (identity_id, connection_id)
  WHERE revoked_at IS NULL;

CREATE TABLE tabular.browser_session_csrf_tokens (
  token_hash text PRIMARY KEY,
  session_id text NOT NULL REFERENCES tabular.browser_sessions(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT browser_session_csrf_tokens_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT browser_session_csrf_tokens_expiry CHECK (issued_at < expires_at)
);

CREATE INDEX browser_session_csrf_tokens_session_idx
  ON tabular.browser_session_csrf_tokens (session_id, issued_at DESC);

CREATE TABLE tabular.catalog_schemas (
  id text PRIMARY KEY,
  connection_id text NOT NULL,
  database_oid oid NOT NULL,
  namespace_oid oid NOT NULL,
  accepted_name text NOT NULL,
  observed_name text NOT NULL,
  state text NOT NULL DEFAULT 'current',
  first_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  missing_at timestamptz,
  CONSTRAINT catalog_schemas_id_format CHECK (id ~ '^schema_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT catalog_schemas_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT catalog_schemas_state CHECK (state IN ('current', 'renamed', 'missing', 'replaced'))
);

CREATE UNIQUE INDEX catalog_schemas_active_pg_identity
  ON tabular.catalog_schemas (connection_id, database_oid, namespace_oid)
  WHERE state IN ('current', 'renamed');

CREATE TABLE tabular.catalog_objects (
  id text PRIMARY KEY,
  schema_id text NOT NULL REFERENCES tabular.catalog_schemas(id),
  connection_id text NOT NULL,
  database_oid oid NOT NULL,
  relation_oid oid NOT NULL,
  object_kind text NOT NULL,
  accepted_schema text NOT NULL,
  accepted_name text NOT NULL,
  observed_schema text NOT NULL,
  observed_name text NOT NULL,
  accepted_fingerprint text NOT NULL,
  observed_fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'current',
  first_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  missing_at timestamptz,
  CONSTRAINT catalog_objects_id_format CHECK (id ~ '^obj_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT catalog_objects_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT catalog_objects_kind CHECK (
    object_kind IN ('table', 'partitioned-table', 'view', 'materialized-view', 'foreign-table')
  ),
  CONSTRAINT catalog_objects_fingerprint_format CHECK (
    accepted_fingerprint ~ '^[a-f0-9]{64}$'
    AND observed_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT catalog_objects_state CHECK (
    state IN ('current', 'renamed', 'changed', 'missing', 'replaced')
  )
);

CREATE UNIQUE INDEX catalog_objects_active_pg_identity
  ON tabular.catalog_objects (connection_id, database_oid, relation_oid)
  WHERE state IN ('current', 'renamed', 'changed');

CREATE TABLE tabular.catalog_columns (
  id text PRIMARY KEY,
  object_id text NOT NULL REFERENCES tabular.catalog_objects(id),
  attribute_number smallint NOT NULL,
  accepted_name text NOT NULL,
  observed_name text NOT NULL,
  accepted_fingerprint text NOT NULL,
  observed_fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'current',
  first_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  missing_at timestamptz,
  CONSTRAINT catalog_columns_id_format CHECK (id ~ '^col_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT catalog_columns_attribute_number CHECK (attribute_number > 0),
  CONSTRAINT catalog_columns_fingerprint_format CHECK (
    accepted_fingerprint ~ '^[a-f0-9]{64}$'
    AND observed_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT catalog_columns_state CHECK (
    state IN ('current', 'renamed', 'changed', 'missing', 'replaced')
  )
);

CREATE UNIQUE INDEX catalog_columns_active_pg_identity
  ON tabular.catalog_columns (object_id, attribute_number)
  WHERE state IN ('current', 'renamed', 'changed');

COMMENT ON TABLE tabular.identities IS
  'Provider-neutral application identities keyed by provider-scoped immutable subjects';
COMMENT ON TABLE tabular.identity_role_mappings IS
  'Server-administered identity-to-PostgreSQL-role mappings; browser input never selects a role';
COMMENT ON TABLE tabular.allowed_roles IS
  'Operator-administered allowlist pinned to PostgreSQL database and role OIDs';
COMMENT ON TABLE tabular.browser_sessions IS
  'Opaque browser session and synchronizer-token hashes with bounded lifetime and revocation';
COMMENT ON TABLE tabular.browser_session_csrf_tokens IS
  'Bounded additional synchronizer-token hashes issued to resumed browser tabs';
COMMENT ON TABLE tabular.catalog_objects IS
  'Stable relation identities reconciled from a complete live snapshot before caller filtering';
COMMENT ON TABLE tabular.catalog_schemas IS
  'Stable schema identities reconciled from a complete live snapshot before caller filtering';
COMMENT ON TABLE tabular.catalog_columns IS
  'Stable column identities reconciled by relation identity and PostgreSQL attribute number';

CREATE TABLE tabular.postgresql_login_identities (
  identity_id text PRIMARY KEY REFERENCES tabular.identities(id) ON DELETE CASCADE,
  connection_id text NOT NULL,
  database_oid oid NOT NULL,
  role_oid oid NOT NULL,
  role_name name NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT postgresql_login_identities_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT postgresql_login_identities_oid_unique UNIQUE (
    connection_id, database_oid, role_oid
  )
);

CREATE TABLE tabular.postgresql_login_attempts (
  attempt_key_hash text PRIMARY KEY,
  attempt_count integer NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT postgresql_login_attempts_key_format CHECK (
    attempt_key_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT postgresql_login_attempts_count_positive CHECK (attempt_count > 0),
  CONSTRAINT postgresql_login_attempts_block_order CHECK (
    blocked_until IS NULL OR blocked_until > window_started_at
  )
);

CREATE INDEX postgresql_login_attempts_updated_idx
  ON tabular.postgresql_login_attempts (updated_at);

COMMENT ON TABLE tabular.postgresql_login_identities IS
  'Verified PostgreSQL database and human LOGIN role OIDs; no password material';
COMMENT ON TABLE tabular.postgresql_login_attempts IS
  'Bounded sign-in attempts keyed by a one-way role-name digest; no submitted passwords';

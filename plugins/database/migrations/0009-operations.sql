ALTER TABLE tabular.allowed_roles
  ADD COLUMN can_manage_operations_retention boolean NOT NULL DEFAULT false;

CREATE TABLE tabular.operations_retention_policy (
  connection_id text PRIMARY KEY,
  retention_days integer NOT NULL DEFAULT 90,
  updated_by_identity_id text NOT NULL REFERENCES tabular.identities(id),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT operations_retention_policy_connection CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT operations_retention_policy_days CHECK (
    retention_days IN (30, 90, 180, 365)
  )
);

ALTER TABLE tabular.outbox_events
  ALTER COLUMN file_id DROP NOT NULL,
  DROP CONSTRAINT outbox_events_file_format,
  DROP CONSTRAINT outbox_events_type,
  ADD CONSTRAINT outbox_events_file_format CHECK (
    file_id IS NULL OR file_id ~ '^obj_[A-Za-z0-9_-]{32,64}$'
  ),
  ADD CONSTRAINT outbox_events_type CHECK (
    event_type IN (
      'grid.changed', 'schema.changed', 'saved-view.changed',
      'saved-view.deleted', 'row-order.changed', 'row-order.maintenance',
      'operation.changed'
    )
  );

CREATE FUNCTION tabular.append_outbox_event(
  event_id text,
  stream_connection_id text,
  target_file_id text,
  event_actor_identity_id text,
  event_audience_identity_id text,
  event_type_name text,
  event_idempotency_key text,
  event_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('tabular-outbox:' || event_idempotency_key, 0)
  );
  IF EXISTS (
    SELECT 1 FROM tabular.outbox_events
     WHERE idempotency_key = event_idempotency_key
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO tabular.outbox_events (
    sequence, id, connection_id, file_id, actor_identity_id,
    audience_identity_id, event_type, idempotency_key, payload
  ) VALUES (
    tabular.allocate_change_cursor(stream_connection_id),
    event_id, stream_connection_id, target_file_id, event_actor_identity_id,
    event_audience_identity_id, event_type_name, event_idempotency_key, event_payload
  );
  RETURN true;
END;
$$;

CREATE TABLE tabular.operation_idempotency (
  connection_id text NOT NULL,
  actor_identity_id text NOT NULL REFERENCES tabular.identities(id),
  idempotency_key text NOT NULL,
  kind text NOT NULL,
  schema_version integer NOT NULL,
  request_digest text NOT NULL,
  original_job_id text NOT NULL,
  active_job_id text,
  terminal_state text,
  acknowledged_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (connection_id, actor_identity_id, idempotency_key),
  CONSTRAINT operation_idempotency_connection CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT operation_idempotency_key CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  CONSTRAINT operation_idempotency_kind CHECK (kind IN (
    'import.commit', 'export.csv', 'ddl.apply', 'draft.promote',
    'row-order.maintenance', 'maintenance.import-staging', 'operations.retention'
  )),
  CONSTRAINT operation_idempotency_schema_version CHECK (schema_version = 1),
  CONSTRAINT operation_idempotency_request_digest CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT operation_idempotency_job_format CHECK (
    original_job_id ~ '^job_[A-Za-z0-9_-]{32,64}$'
    AND (active_job_id IS NULL OR active_job_id ~ '^job_[A-Za-z0-9_-]{32,64}$')
  ),
  CONSTRAINT operation_idempotency_terminal_state CHECK (
    terminal_state IS NULL OR terminal_state IN (
      'succeeded', 'failed', 'cancelled', 'dead-letter'
    )
  ),
  CONSTRAINT operation_idempotency_retired CHECK (
    (retired_at IS NULL AND active_job_id IS NOT NULL)
    OR (retired_at IS NOT NULL AND active_job_id IS NULL AND terminal_state IS NOT NULL)
  )
);

CREATE TABLE tabular.operation_jobs (
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  connection_id text NOT NULL,
  actor_identity_id text NOT NULL REFERENCES tabular.identities(id),
  session_id text NOT NULL,
  history_scope_id text NOT NULL,
  file_id text REFERENCES tabular.catalog_objects(id),
  kind text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  authority_scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_digest text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  progress smallint NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  lease_owner text,
  lease_token text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  cancel_requested_at timestamptz,
  irreversible_at timestamptz,
  result_summary jsonb,
  error_summary jsonb,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by_identity_id text REFERENCES tabular.identities(id),
  retained_until timestamptz NOT NULL,
  CONSTRAINT operation_jobs_id_format CHECK (id ~ '^job_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT operation_jobs_connection CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT operation_jobs_kind CHECK (kind IN (
    'import.commit', 'export.csv', 'ddl.apply', 'draft.promote',
    'row-order.maintenance', 'maintenance.import-staging', 'operations.retention'
  )),
  CONSTRAINT operation_jobs_schema_version CHECK (schema_version = 1),
  CONSTRAINT operation_jobs_authority CHECK (authority_scope IN ('worker', 'migrator')),
  CONSTRAINT operation_jobs_idempotency CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  CONSTRAINT operation_jobs_request_digest CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT operation_jobs_json CHECK (
    jsonb_typeof(payload) = 'object'
    AND pg_column_size(payload) <= 16384
    AND (result_summary IS NULL OR (
      jsonb_typeof(result_summary) = 'object' AND pg_column_size(result_summary) <= 8192
    ))
    AND (error_summary IS NULL OR (
      jsonb_typeof(error_summary) = 'object' AND pg_column_size(error_summary) <= 4096
    ))
    AND jsonb_typeof(diagnostics) = 'object'
    AND pg_column_size(diagnostics) <= 4096
  ),
  CONSTRAINT operation_jobs_state CHECK (state IN (
    'queued', 'running', 'succeeded', 'failed', 'retrying', 'cancelled', 'dead-letter'
  )),
  CONSTRAINT operation_jobs_attempts CHECK (
    attempts BETWEEN 0 AND 20 AND max_attempts BETWEEN 1 AND 20 AND attempts <= max_attempts
  ),
  CONSTRAINT operation_jobs_progress CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT operation_jobs_lease CHECK (
    (state = 'running'
      AND lease_owner IS NOT NULL AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL AND heartbeat_at IS NOT NULL)
    OR
    (state <> 'running'
      AND lease_owner IS NULL AND lease_token IS NULL
      AND lease_expires_at IS NULL AND heartbeat_at IS NULL)
  ),
  CONSTRAINT operation_jobs_lease_token CHECK (
    lease_token IS NULL OR lease_token ~ '^[A-Za-z0-9_-]{32,96}$'
  ),
  CONSTRAINT operation_jobs_terminal CHECK (
    (state IN ('succeeded', 'failed', 'cancelled', 'dead-letter') AND finished_at IS NOT NULL)
    OR (state IN ('queued', 'running', 'retrying') AND finished_at IS NULL)
  ),
  CONSTRAINT operation_jobs_acknowledgement CHECK (
    (acknowledged_at IS NULL AND acknowledged_by_identity_id IS NULL)
    OR (acknowledged_at IS NOT NULL AND acknowledged_by_identity_id IS NOT NULL
      AND state IN ('failed', 'dead-letter'))
  ),
  CONSTRAINT operation_jobs_retention CHECK (created_at < retained_until),
  CONSTRAINT operation_jobs_version CHECK (version > 0),
  CONSTRAINT operation_jobs_idempotency_fk FOREIGN KEY (
    connection_id, actor_identity_id, idempotency_key
  ) REFERENCES tabular.operation_idempotency (
    connection_id, actor_identity_id, idempotency_key
  ) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE tabular.operation_idempotency
  ADD CONSTRAINT operation_idempotency_active_job_fk FOREIGN KEY (active_job_id)
    REFERENCES tabular.operation_jobs(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX operation_jobs_claim_idx
  ON tabular.operation_jobs (authority_scope, available_at, sequence)
  WHERE state IN ('queued', 'retrying', 'running');

CREATE INDEX operation_jobs_activity_idx
  ON tabular.operation_jobs (connection_id, updated_at DESC, sequence DESC);

CREATE INDEX operation_jobs_actor_idx
  ON tabular.operation_jobs (actor_identity_id, updated_at DESC, sequence DESC);

CREATE TABLE tabular.operation_attempts (
  job_id text NOT NULL REFERENCES tabular.operation_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  lease_owner text NOT NULL,
  lease_token_digest text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  finished_at timestamptz,
  outcome text NOT NULL DEFAULT 'running',
  error_summary jsonb,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (job_id, attempt_number),
  CONSTRAINT operation_attempts_number CHECK (attempt_number BETWEEN 1 AND 20),
  CONSTRAINT operation_attempts_token_digest CHECK (lease_token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT operation_attempts_outcome CHECK (outcome IN (
    'running', 'succeeded', 'failed', 'retrying', 'cancelled', 'lease-expired', 'dead-letter'
  )),
  CONSTRAINT operation_attempts_terminal CHECK (
    (outcome = 'running' AND finished_at IS NULL)
    OR (outcome <> 'running' AND finished_at IS NOT NULL)
  ),
  CONSTRAINT operation_attempts_json CHECK (
    (error_summary IS NULL OR (
      jsonb_typeof(error_summary) = 'object' AND pg_column_size(error_summary) <= 4096
    ))
    AND jsonb_typeof(diagnostics) = 'object'
    AND pg_column_size(diagnostics) <= 4096
  )
);

CREATE TABLE tabular.operation_reads (
  job_id text NOT NULL REFERENCES tabular.operation_jobs(id) ON DELETE CASCADE,
  identity_id text NOT NULL REFERENCES tabular.identities(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (job_id, identity_id)
);

CREATE FUNCTION tabular.operation_attempts_final_once()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'Finished operation attempts are immutable';
  END IF;
  IF NEW.job_id <> OLD.job_id
    OR NEW.attempt_number <> OLD.attempt_number
    OR NEW.lease_owner <> OLD.lease_owner
    OR NEW.lease_token_digest <> OLD.lease_token_digest
    OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'Operation attempt identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER operation_attempts_final_once
BEFORE UPDATE ON tabular.operation_attempts
FOR EACH ROW EXECUTE FUNCTION tabular.operation_attempts_final_once();

CREATE FUNCTION tabular.append_operation_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM tabular.append_outbox_event(
    'evt_' || encode(sha256(convert_to('operation:' || NEW.id || ':' || NEW.version, 'UTF8')), 'hex'),
    NEW.connection_id,
    NEW.file_id,
    NEW.actor_identity_id,
    NEW.actor_identity_id,
    'operation.changed',
    'operation:' || NEW.id || ':' || NEW.version,
    jsonb_build_object(
      'jobId', NEW.id,
      'kind', NEW.kind,
      'state', NEW.state,
      'progress', NEW.progress,
      'version', NEW.version
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER operation_jobs_outbox
AFTER INSERT OR UPDATE OF state, progress, cancel_requested_at,
  irreversible_at, result_summary, error_summary, acknowledged_at
ON tabular.operation_jobs
FOR EACH ROW EXECUTE FUNCTION tabular.append_operation_outbox_event();

CREATE OR REPLACE FUNCTION tabular.append_action_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_order_version bigint;
BEGIN
  PERFORM tabular.append_outbox_event(
    'evt_' || encode(sha256(convert_to('action:' || NEW.id, 'UTF8')), 'hex'),
    NEW.connection_id, NEW.file_id, NEW.actor_identity_id, NULL,
    'grid.changed', 'action:' || NEW.id,
    jsonb_build_object('actionId', NEW.id, 'actionType', NEW.action_type)
  );
  IF NEW.action_type IN ('record.insert', 'record.delete') THEN
    UPDATE tabular.row_order_state
       SET version = version + 1, updated_at = clock_timestamp()
     WHERE file_id = NEW.file_id
     RETURNING version INTO row_order_version;
    IF row_order_version IS NOT NULL THEN
      PERFORM tabular.append_outbox_event(
        'evt_' || encode(sha256(convert_to('row-order-action:' || NEW.id, 'UTF8')), 'hex'),
        NEW.connection_id, NEW.file_id, NEW.actor_identity_id, NULL,
        'row-order.changed', 'row-order-action:' || NEW.id,
        jsonb_build_object('version', row_order_version, 'actionType', NEW.action_type)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tabular.append_file_ddl_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request tabular.file_ddl_requests%ROWTYPE;
BEGIN
  SELECT * INTO request FROM tabular.file_ddl_requests WHERE id = NEW.request_id;
  IF NEW.target_object_id IS NOT NULL THEN
    PERFORM tabular.append_outbox_event(
      'evt_' || encode(sha256(convert_to('ddl:' || NEW.request_id, 'UTF8')), 'hex'),
      NEW.connection_id, NEW.target_object_id, request.actor_identity_id, NULL,
      'schema.changed', 'ddl:' || NEW.request_id,
      jsonb_build_object('requestId', NEW.request_id, 'actionType', NEW.action_type)
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON TABLE tabular.operation_jobs IS
  'Durable redacted operation state; payloads contain typed identifiers and bounds, never source rows, exports, credentials, or secrets';
COMMENT ON TABLE tabular.operation_attempts IS
  'Lease-fenced attempt ledger; a running attempt may be finalized once and is immutable thereafter';
COMMENT ON TABLE tabular.operation_idempotency IS
  'Persistent request tombstones prevent duplicate effects after operation retention';
COMMENT ON COLUMN tabular.allowed_roles.can_manage_operations_retention IS
  'Operator-administered fail-closed permission for bounded Tabular operations retention';

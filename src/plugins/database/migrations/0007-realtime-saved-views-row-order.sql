CREATE TABLE tabular.saved_views (
  id text PRIMARY KEY,
  connection_id text NOT NULL,
  file_id text NOT NULL REFERENCES tabular.catalog_objects(id),
  owner_identity_id text NOT NULL REFERENCES tabular.identities(id),
  name text NOT NULL,
  slug text NOT NULL,
  access text NOT NULL,
  definition jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT saved_views_id_format CHECK (id ~ '^view_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT saved_views_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT saved_views_name_format CHECK (
    name = btrim(name) AND length(name) BETWEEN 1 AND 120
    AND name !~ '[[:cntrl:]]'
  ),
  CONSTRAINT saved_views_slug_format CHECK (
    slug = btrim(slug) AND slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'
  ),
  CONSTRAINT saved_views_access CHECK (access IN ('private', 'shared')),
  CONSTRAINT saved_views_definition_object CHECK (
    jsonb_typeof(definition) = 'object'
    AND definition->>'schemaVersion' = '1'
  ),
  CONSTRAINT saved_views_version CHECK (version > 0)
);

CREATE UNIQUE INDEX saved_views_owner_name_unique
  ON tabular.saved_views (file_id, owner_identity_id, lower(name));

CREATE UNIQUE INDEX saved_views_owner_slug_unique
  ON tabular.saved_views (file_id, owner_identity_id, slug);

CREATE INDEX saved_views_file_access_idx
  ON tabular.saved_views (file_id, access, updated_at DESC, id);

CREATE TABLE tabular.saved_view_commands (
  actor_identity_id text NOT NULL REFERENCES tabular.identities(id),
  connection_id text NOT NULL,
  command_id text NOT NULL,
  request_digest text NOT NULL,
  action_type text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (actor_identity_id, connection_id, command_id),
  CONSTRAINT saved_view_commands_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT saved_view_commands_command_format CHECK (
    command_id ~ '^cmd_[A-Za-z0-9_-]{8,96}$'
  ),
  CONSTRAINT saved_view_commands_digest_format CHECK (
    request_digest ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT saved_view_commands_action_type CHECK (
    action_type IN (
      'saved-view.create', 'saved-view.update', 'saved-view.duplicate',
      'saved-view.delete', 'row-order.move'
    )
  ),
  CONSTRAINT saved_view_commands_result_object CHECK (jsonb_typeof(result) = 'object')
);

CREATE TABLE tabular.row_order_state (
  file_id text PRIMARY KEY REFERENCES tabular.catalog_objects(id),
  rank_column_id text NOT NULL REFERENCES tabular.column_metadata(column_id),
  version bigint NOT NULL DEFAULT 1,
  last_rebalanced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT row_order_state_version CHECK (version > 0)
);

INSERT INTO tabular.row_order_state (file_id, rank_column_id)
SELECT object_id, column_id
  FROM tabular.column_metadata
 WHERE hidden AND hidden_purpose = 'shared-rank'
ON CONFLICT (file_id) DO NOTHING;

CREATE TABLE tabular.row_order_maintenance (
  id text PRIMARY KEY,
  file_id text NOT NULL REFERENCES tabular.catalog_objects(id),
  idempotency_key text NOT NULL UNIQUE,
  reason text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT row_order_maintenance_id_format CHECK (
    id ~ '^job_[A-Za-z0-9_-]{32,64}$'
  ),
  CONSTRAINT row_order_maintenance_reason CHECK (
    reason IN ('rank-density', 'delivery-recovery')
  ),
  CONSTRAINT row_order_maintenance_state CHECK (
    state IN ('queued', 'running', 'completed', 'failed')
  ),
  CONSTRAINT row_order_maintenance_attempts CHECK (attempts >= 0)
);

CREATE INDEX row_order_maintenance_claim_idx
  ON tabular.row_order_maintenance (state, created_at, id)
  WHERE state IN ('queued', 'failed');

CREATE TABLE tabular.change_streams (
  connection_id text PRIMARY KEY,
  next_cursor bigint NOT NULL DEFAULT 1,
  retained_from_cursor bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT change_streams_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT change_streams_cursor_bounds CHECK (
    next_cursor > 0
    AND retained_from_cursor > 0
    AND retained_from_cursor <= next_cursor
  )
);

CREATE FUNCTION tabular.allocate_change_cursor(stream_connection_id text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  allocated bigint;
BEGIN
  INSERT INTO tabular.change_streams (connection_id)
  VALUES (stream_connection_id)
  ON CONFLICT (connection_id) DO NOTHING;

  UPDATE tabular.change_streams
     SET next_cursor = next_cursor + 1,
         updated_at = clock_timestamp()
   WHERE connection_id = stream_connection_id
   RETURNING next_cursor - 1 INTO allocated;
  RETURN allocated;
END;
$$;

CREATE TABLE tabular.outbox_events (
  sequence bigint NOT NULL,
  id text NOT NULL UNIQUE,
  connection_id text NOT NULL,
  file_id text NOT NULL,
  actor_identity_id text REFERENCES tabular.identities(id),
  audience_identity_id text REFERENCES tabular.identities(id),
  event_type text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT outbox_events_id_format CHECK (id ~ '^evt_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT outbox_events_connection_format CHECK (
    connection_id = btrim(connection_id)
    AND connection_id ~ '^[a-z][a-z0-9_-]{0,62}$'
  ),
  CONSTRAINT outbox_events_file_format CHECK (file_id ~ '^obj_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT outbox_events_type CHECK (
    event_type IN (
      'grid.changed', 'schema.changed', 'saved-view.changed',
      'saved-view.deleted', 'row-order.changed', 'row-order.maintenance'
    )
  ),
  CONSTRAINT outbox_events_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT outbox_events_cursor_positive CHECK (sequence > 0),
  CONSTRAINT outbox_events_cursor_unique UNIQUE (connection_id, sequence)
);

CREATE INDEX outbox_events_connection_cursor_idx
  ON tabular.outbox_events (connection_id, sequence);

CREATE INDEX outbox_events_file_cursor_idx
  ON tabular.outbox_events (connection_id, file_id, sequence);

CREATE INDEX outbox_events_audience_cursor_idx
  ON tabular.outbox_events (connection_id, audience_identity_id, sequence)
  WHERE audience_identity_id IS NOT NULL;

CREATE FUNCTION tabular.append_action_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_order_version bigint;
BEGIN
  INSERT INTO tabular.outbox_events (
    sequence, id, connection_id, file_id, actor_identity_id,
    event_type, idempotency_key, payload
  ) VALUES (
    tabular.allocate_change_cursor(NEW.connection_id),
    'evt_' || encode(sha256(convert_to('action:' || NEW.id, 'UTF8')), 'hex'),
    NEW.connection_id,
    NEW.file_id,
    NEW.actor_identity_id,
    'grid.changed',
    'action:' || NEW.id,
    jsonb_build_object('actionId', NEW.id, 'actionType', NEW.action_type)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NEW.action_type IN ('record.insert', 'record.delete') THEN
    UPDATE tabular.row_order_state
       SET version = version + 1,
           updated_at = clock_timestamp()
     WHERE file_id = NEW.file_id
     RETURNING version INTO row_order_version;
    IF row_order_version IS NOT NULL THEN
      INSERT INTO tabular.outbox_events (
        sequence, id, connection_id, file_id, actor_identity_id,
        event_type, idempotency_key, payload
      ) VALUES (
        tabular.allocate_change_cursor(NEW.connection_id),
        'evt_' || encode(sha256(convert_to('row-order-action:' || NEW.id, 'UTF8')), 'hex'),
        NEW.connection_id,
        NEW.file_id,
        NEW.actor_identity_id,
        'row-order.changed',
        'row-order-action:' || NEW.id,
        jsonb_build_object('version', row_order_version, 'actionType', NEW.action_type)
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER action_journal_outbox
AFTER INSERT ON tabular.action_journal
FOR EACH ROW EXECUTE FUNCTION tabular.append_action_outbox_event();

CREATE FUNCTION tabular.append_file_ddl_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request tabular.file_ddl_requests%ROWTYPE;
BEGIN
  SELECT * INTO request FROM tabular.file_ddl_requests WHERE id = NEW.request_id;
  IF NEW.target_object_id IS NOT NULL THEN
    INSERT INTO tabular.outbox_events (
      sequence, id, connection_id, file_id, actor_identity_id,
      event_type, idempotency_key, payload
    ) VALUES (
      tabular.allocate_change_cursor(NEW.connection_id),
      'evt_' || encode(sha256(convert_to('ddl:' || NEW.request_id, 'UTF8')), 'hex'),
      NEW.connection_id,
      NEW.target_object_id,
      request.actor_identity_id,
      'schema.changed',
      'ddl:' || NEW.request_id,
      jsonb_build_object('requestId', NEW.request_id, 'actionType', NEW.action_type)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER file_ddl_versions_outbox
AFTER INSERT ON tabular.file_ddl_versions
FOR EACH ROW EXECUTE FUNCTION tabular.append_file_ddl_outbox_event();

CREATE FUNCTION tabular.register_shared_rank_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.hidden AND NEW.hidden_purpose = 'shared-rank' THEN
    INSERT INTO tabular.row_order_state (file_id, rank_column_id)
    VALUES (NEW.object_id, NEW.column_id)
    ON CONFLICT (file_id) DO UPDATE
      SET rank_column_id = EXCLUDED.rank_column_id,
          version = tabular.row_order_state.version + 1,
          updated_at = clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER column_metadata_shared_rank_state
AFTER INSERT OR UPDATE OF hidden, hidden_purpose, catalog_column_id
ON tabular.column_metadata
FOR EACH ROW EXECUTE FUNCTION tabular.register_shared_rank_state();

COMMENT ON TABLE tabular.saved_views IS
  'Stable file-bound private and shared presentation definitions; definitions never grant PostgreSQL authority';
COMMENT ON TABLE tabular.saved_view_commands IS
  'Actor-scoped mutation replay ledger; command identities cannot be rebound to different saved-view or row-order requests';
COMMENT ON TABLE tabular.row_order_state IS
  'Versioned binding to the owner-installed collision-safe shared-rank column';
COMMENT ON TABLE tabular.row_order_maintenance IS
  'Minimal durable Task 00010 rank-maintenance queue; Task 00012 adds the general worker and dead-letter surface';
COMMENT ON TABLE tabular.outbox_events IS
  'Durable post-commit invalidation ledger and monotonic SSE replay source; payloads contain no cell values';
COMMENT ON TABLE tabular.change_streams IS
  'Per-connection commit-ordered cursor allocator and explicit retention floor for authorized replay';

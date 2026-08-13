ALTER TABLE tabular.browser_sessions
  ADD COLUMN history_scope_id text;

UPDATE tabular.browser_sessions
   SET history_scope_id = 'hist_' || substr(id, 6)
 WHERE history_scope_id IS NULL;

ALTER TABLE tabular.browser_sessions
  ALTER COLUMN history_scope_id SET NOT NULL,
  ADD CONSTRAINT browser_sessions_history_scope_format CHECK (
    history_scope_id ~ '^hist_[A-Za-z0-9_-]{32,64}$'
  ),
  ADD CONSTRAINT browser_sessions_action_scope_unique UNIQUE (
    id, identity_id, connection_id, history_scope_id
  );

CREATE INDEX browser_sessions_history_scope_idx
  ON tabular.browser_sessions (identity_id, connection_id, history_scope_id);

CREATE TABLE tabular.action_journal (
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  command_id text NOT NULL,
  actor_identity_id text NOT NULL,
  session_id text NOT NULL,
  history_scope_id text NOT NULL,
  connection_id text NOT NULL,
  file_id text NOT NULL,
  action_type text NOT NULL,
  surface text NOT NULL,
  request_digest text NOT NULL,
  schema_version text NOT NULL,
  affected_row_count integer NOT NULL,
  affected_cell_count integer NOT NULL,
  outcome text NOT NULL,
  reversal_of_action_id text,
  result_summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT action_journal_id_format CHECK (id ~ '^act_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT action_journal_command_format CHECK (command_id ~ '^cmd_[A-Za-z0-9_-]{8,96}$'),
  CONSTRAINT action_journal_file_format CHECK (file_id ~ '^obj_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT action_journal_schema_version_format CHECK (schema_version ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_journal_request_digest_format CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_journal_action_type CHECK (
    action_type IN (
      'record.patch', 'range.patch', 'draft.promote', 'history.undo', 'history.redo'
      , 'draft.create', 'draft.update', 'draft.delete'
    )
  ),
  CONSTRAINT action_journal_surface CHECK (surface IN ('web', 'mcp')),
  CONSTRAINT action_journal_counts CHECK (
    affected_row_count >= 0
    AND affected_cell_count >= 0
    AND (
      (action_type IN ('draft.create', 'draft.update', 'draft.delete')
        AND affected_row_count = 0)
      OR
      (action_type NOT IN ('draft.create', 'draft.update', 'draft.delete')
        AND affected_row_count > 0
        AND affected_cell_count >= affected_row_count)
    )
  ),
  CONSTRAINT action_journal_outcome CHECK (outcome IN ('committed', 'replayed')),
  CONSTRAINT action_journal_result_object CHECK (jsonb_typeof(result_summary) = 'object'),
  CONSTRAINT action_journal_actor_fk FOREIGN KEY (actor_identity_id)
    REFERENCES tabular.identities(id),
  CONSTRAINT action_journal_command_scope_unique UNIQUE (
    actor_identity_id, connection_id, command_id
  )
);

ALTER TABLE tabular.action_journal
  ADD CONSTRAINT action_journal_reversal_fk FOREIGN KEY (reversal_of_action_id)
    REFERENCES tabular.action_journal(id);

CREATE INDEX action_journal_history_idx
  ON tabular.action_journal (
    actor_identity_id, history_scope_id, sequence DESC
  );

CREATE TABLE tabular.session_action_entries (
  action_id text PRIMARY KEY REFERENCES tabular.action_journal(id) ON DELETE CASCADE,
  actor_identity_id text NOT NULL REFERENCES tabular.identities(id),
  history_scope_id text NOT NULL,
  file_id text NOT NULL,
  forward_patch jsonb NOT NULL,
  inverse_patch jsonb NOT NULL,
  prior_versions jsonb NOT NULL,
  resulting_versions jsonb NOT NULL,
  operations jsonb NOT NULL,
  active_incarnations jsonb NOT NULL,
  last_reversal_versions jsonb,
  state text NOT NULL DEFAULT 'applied',
  undone_at timestamptz,
  redo_invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT session_action_entries_scope_format CHECK (
    history_scope_id ~ '^hist_[A-Za-z0-9_-]{32,64}$'
  ),
  CONSTRAINT session_action_entries_file_format CHECK (file_id ~ '^obj_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT session_action_entries_forward_array CHECK (jsonb_typeof(forward_patch) = 'array'),
  CONSTRAINT session_action_entries_inverse_array CHECK (jsonb_typeof(inverse_patch) = 'array'),
  CONSTRAINT session_action_entries_prior_object CHECK (jsonb_typeof(prior_versions) = 'object'),
  CONSTRAINT session_action_entries_result_object CHECK (jsonb_typeof(resulting_versions) = 'object'),
  CONSTRAINT session_action_entries_operations_object CHECK (jsonb_typeof(operations) = 'object'),
  CONSTRAINT session_action_entries_incarnations_object CHECK (
    jsonb_typeof(active_incarnations) = 'object'
  ),
  CONSTRAINT session_action_entries_last_result_object CHECK (
    last_reversal_versions IS NULL OR jsonb_typeof(last_reversal_versions) = 'object'
  ),
  CONSTRAINT session_action_entries_state CHECK (state IN ('applied', 'undone')),
  CONSTRAINT session_action_entries_expiry_order CHECK (created_at < expires_at)
);

CREATE INDEX session_action_entries_history_idx
  ON tabular.session_action_entries (
    actor_identity_id, history_scope_id, created_at DESC, action_id DESC
  );

CREATE TABLE tabular.action_drafts (
  id text PRIMARY KEY,
  actor_identity_id text NOT NULL,
  session_id text NOT NULL,
  history_scope_id text NOT NULL,
  connection_id text NOT NULL,
  file_id text NOT NULL,
  row_id text,
  schema_version text NOT NULL,
  patch jsonb NOT NULL,
  validation_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_version bigint NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  promoted_action_id text REFERENCES tabular.action_journal(id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  promoted_at timestamptz,
  CONSTRAINT action_drafts_id_format CHECK (id ~ '^draft_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT action_drafts_file_format CHECK (file_id ~ '^obj_[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT action_drafts_row_format CHECK (
    row_id IS NULL OR row_id ~ '^row_[A-Za-z0-9_-]{1,256}$'
  ),
  CONSTRAINT action_drafts_schema_version_format CHECK (schema_version ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_drafts_patch_array CHECK (jsonb_typeof(patch) = 'array'),
  CONSTRAINT action_drafts_validation_array CHECK (jsonb_typeof(validation_state) = 'array'),
  CONSTRAINT action_drafts_version CHECK (draft_version > 0),
  CONSTRAINT action_drafts_state CHECK (state IN ('active', 'expired', 'promoted', 'abandoned')),
  CONSTRAINT action_drafts_expiry CHECK (created_at < expires_at),
  CONSTRAINT action_drafts_promotion_state CHECK (
    (state = 'promoted' AND promoted_action_id IS NOT NULL AND promoted_at IS NOT NULL)
    OR (state <> 'promoted' AND promoted_action_id IS NULL AND promoted_at IS NULL)
  ),
  CONSTRAINT action_drafts_actor_fk FOREIGN KEY (actor_identity_id)
    REFERENCES tabular.identities(id)
);

CREATE INDEX action_drafts_owner_idx
  ON tabular.action_drafts (
    actor_identity_id, history_scope_id, state, updated_at DESC
  );

COMMENT ON TABLE tabular.action_journal IS
  'Value-free canonical action metadata; caller-visible history is projected only from this table';
COMMENT ON TABLE tabular.session_action_entries IS
  'Expiring, bounded current-session reversal state; not durable replayable history';
COMMENT ON TABLE tabular.action_drafts IS
  'Persistent actor-owned incomplete-row drafts with session provenance and stable object and column identities';

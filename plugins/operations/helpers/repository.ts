import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type {
  OperationAuthority,
  OperationKind,
  OperationPayload,
  OperationState
} from './contracts.js';

export type StoredOperationRow = {
  id: string;
  connection_id: string;
  actor_identity_id: string;
  session_id: string;
  history_scope_id: string;
  file_id: string | null;
  kind: OperationKind;
  schema_version: string | number;
  authority_scope: OperationAuthority;
  idempotency_key: string;
  request_digest: string;
  payload: OperationPayload;
  state: OperationState;
  progress: string | number;
  attempts: string | number;
  max_attempts: string | number;
  available_at: Date | string;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: Date | string | null;
  heartbeat_at: Date | string | null;
  cancel_requested_at: Date | string | null;
  irreversible_at: Date | string | null;
  result_summary: Record<string, unknown> | null;
  error_summary: Record<string, unknown> | null;
  diagnostics: Record<string, unknown>;
  version: string | number;
  created_at: Date | string;
  updated_at: Date | string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  acknowledged_at: Date | string | null;
  acknowledged_by_identity_id: string | null;
  retained_until: Date | string;
  read_at?: Date | string | null;
  schema_name?: string | null;
  object_name?: string | null;
};

export type OperationIdempotencyRow = {
  connection_id: string;
  actor_identity_id: string;
  idempotency_key: string;
  kind: OperationKind;
  schema_version: string | number;
  request_digest: string;
  original_job_id: string;
  active_job_id: string | null;
  terminal_state: OperationState | null;
  acknowledged_at: Date | string | null;
  retired_at: Date | string | null;
};

export type StoredOperationEventRow = {
  sequence: string | number;
  file_id: string | null;
  audience_identity_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date | string;
};

export type OperationFileAuthorityTarget = {
  file_id: string;
  relation_oid: string | number;
  namespace_oid: string | number;
  object_state: string;
  relation_kind: string;
};

const OPERATION_COLUMNS = `
  job.id, job.connection_id, job.actor_identity_id, job.session_id,
  job.history_scope_id, job.file_id, job.kind, job.schema_version,
  job.authority_scope, job.idempotency_key, job.request_digest, job.payload,
  job.state, job.progress, job.attempts, job.max_attempts, job.available_at,
  job.lease_owner, job.lease_token, job.lease_expires_at, job.heartbeat_at,
  job.cancel_requested_at, job.irreversible_at, job.result_summary,
  job.error_summary, job.diagnostics, job.version, job.created_at,
  job.updated_at, job.started_at, job.finished_at, job.acknowledged_at,
  job.acknowledged_by_identity_id, job.retained_until
`;

export class OperationsRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async enqueue(input: {
    jobId: string;
    connectionId: string;
    actorIdentityId: string;
    sessionId: string;
    historyScopeId: string;
    fileId?: string;
    kind: OperationKind;
    authority: OperationAuthority;
    idempotencyKey: string;
    requestDigest: string;
    payload: OperationPayload;
    maxAttempts: number;
    retainedUntil: Date;
  }) {
    const ledger = await this.database.execute<OperationIdempotencyRow>(`
      INSERT INTO tabular.operation_idempotency (
        connection_id, actor_identity_id, idempotency_key,
        kind, schema_version, request_digest, original_job_id, active_job_id
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT (connection_id, actor_identity_id, idempotency_key)
      DO UPDATE SET idempotency_key = tabular.operation_idempotency.idempotency_key
      RETURNING connection_id, actor_identity_id, idempotency_key, kind,
                schema_version, request_digest, original_job_id, active_job_id,
                terminal_state, acknowledged_at, retired_at
    `, [
      input.connectionId,
      input.actorIdentityId,
      input.idempotencyKey,
      input.kind,
      input.requestDigest,
      input.jobId,
      input.jobId
    ]);
    const idempotency = required(ledger.rows[0], 'Operation idempotency record was not returned');
    if (idempotency.original_job_id === input.jobId) {
      const created = await this.database.execute<StoredOperationRow>(`
        INSERT INTO tabular.operation_jobs (
          id, connection_id, actor_identity_id, session_id, history_scope_id,
          file_id, kind, authority_scope, idempotency_key, request_digest,
          payload, max_attempts, retained_until
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
        RETURNING ${OPERATION_COLUMNS.replaceAll('job.', '')}
      `, [
        input.jobId,
        input.connectionId,
        input.actorIdentityId,
        input.sessionId,
        input.historyScopeId,
        input.fileId || null,
        input.kind,
        input.authority,
        input.idempotencyKey,
        input.requestDigest,
        JSON.stringify(input.payload),
        input.maxAttempts,
        input.retainedUntil
      ]);
      return { idempotency, job: required(created.rows[0], 'Operation job was not returned'), replayed: false };
    }
    return {
      idempotency,
      job: idempotency.active_job_id ? await this.byId(idempotency.active_job_id) : undefined,
      replayed: true
    };
  }

  async byId(jobId: string, lock = false) {
    const result = await this.database.execute<StoredOperationRow>(`
      SELECT ${OPERATION_COLUMNS}
        FROM tabular.operation_jobs job
       WHERE job.id = ?${lock ? ' FOR UPDATE OF job' : ''}
    `, [jobId]);
    return result.rows[0];
  }

  async byIdForIdentity(jobId: string, identityId: string) {
    const result = await this.database.execute<StoredOperationRow>(`
      SELECT ${OPERATION_COLUMNS}, reads.read_at,
             namespace.observed_name AS schema_name,
             object.observed_name AS object_name
        FROM tabular.operation_jobs job
        LEFT JOIN tabular.operation_reads reads
          ON reads.job_id = job.id AND reads.identity_id = ?
        LEFT JOIN tabular.catalog_objects object ON object.id = job.file_id
        LEFT JOIN tabular.catalog_schemas namespace ON namespace.id = object.schema_id
       WHERE job.id = ?
    `, [identityId, jobId]);
    return result.rows[0];
  }

  async activity(input: {
    connectionId: string;
    identityId: string;
    states?: OperationState[];
    limit: number;
  }) {
    const states = input.states || [];
    const result = await this.database.execute<StoredOperationRow>(`
      SELECT ${OPERATION_COLUMNS}, reads.read_at,
             namespace.observed_name AS schema_name,
             object.observed_name AS object_name
        FROM tabular.operation_jobs job
        LEFT JOIN tabular.operation_reads reads
          ON reads.job_id = job.id AND reads.identity_id = ?
        LEFT JOIN tabular.catalog_objects object ON object.id = job.file_id
        LEFT JOIN tabular.catalog_schemas namespace ON namespace.id = object.schema_id
       WHERE job.connection_id = ?
         AND job.actor_identity_id = ?
         ${states.length ? `AND job.state IN (${states.map(() => '?').join(', ')})` : ''}
       ORDER BY job.updated_at DESC, job.sequence DESC
       LIMIT ?
    `, [input.identityId, input.connectionId, input.identityId, ...states, input.limit]);
    return result.rows;
  }

  /** Resolves internal file identities under base authority before a member role is set. */
  async fileAuthorityTargets(fileIds: string[]) {
    const ids = [...new Set(fileIds)];
    if (!ids.length) return [];
    const result = await this.database.execute<OperationFileAuthorityTarget>(`
      SELECT object.id AS file_id,
             object.relation_oid,
             relation.relnamespace AS namespace_oid,
             object.state AS object_state,
             relation.relkind::text AS relation_kind
        FROM tabular.catalog_objects object
        JOIN pg_class relation ON relation.oid = object.relation_oid
       WHERE object.id IN (${ids.map(() => '?').join(', ')})
    `, ids);
    return result.rows;
  }

  async currentCursor(connectionId: string) {
    const result = await this.database.execute<{ cursor: string | number }>(`
      SELECT next_cursor - 1 AS cursor
        FROM tabular.change_streams
       WHERE connection_id = ?
    `, [connectionId]);
    return Number(result.rows[0]?.cursor || 0);
  }

  async retentionPolicy(connectionId: string) {
    const result = await this.database.execute<{ retention_days: string | number }>(`
      SELECT retention_days
        FROM tabular.operations_retention_policy
       WHERE connection_id = ?
    `, [connectionId]);
    return Number(result.rows[0]?.retention_days || 90);
  }

  async setRetentionPolicy(connectionId: string, identityId: string, retentionDays: number) {
    const result = await this.database.execute<{ retention_days: string | number }>(`
      INSERT INTO tabular.operations_retention_policy (
        connection_id, retention_days, updated_by_identity_id
      ) VALUES (?, ?, ?)
      ON CONFLICT (connection_id) DO UPDATE
      SET retention_days = EXCLUDED.retention_days,
          updated_by_identity_id = EXCLUDED.updated_by_identity_id,
          updated_at = clock_timestamp()
      RETURNING retention_days
    `, [connectionId, retentionDays, identityId]);
    return Number(required(result.rows[0], 'Retention policy was not returned').retention_days);
  }

  async retentionAdminGrant(input: {
    identityId: string;
    sessionId: string;
    connectionId: string;
    historyScopeId: string;
  }) {
    const result = await this.database.execute<{ allowed: boolean }>(`
      SELECT role.can_manage_operations_retention AS allowed
        FROM tabular.browser_sessions session
        JOIN tabular.identities identity ON identity.id = session.identity_id
        JOIN tabular.identity_role_mappings mapping
          ON mapping.identity_id = identity.id
         AND mapping.connection_id = session.connection_id
        JOIN tabular.allowed_roles role ON role.id = mapping.allowed_role_id
        JOIN pg_database database
          ON database.oid = role.database_oid
         AND database.datname = current_database()
        JOIN pg_roles live_role
          ON live_role.oid = role.role_oid
         AND live_role.rolname = role.role_name
       WHERE session.id = ? AND session.identity_id = ?
         AND session.connection_id = ? AND session.history_scope_id = ?
         AND session.revoked_at IS NULL
         AND clock_timestamp() < session.idle_expires_at
         AND clock_timestamp() < session.absolute_expires_at
         AND identity.status = 'active'
         AND session.identity_generation = identity.identity_generation
         AND mapping.enabled
         AND mapping.connection_id = session.connection_id
         AND session.mapping_generation = mapping.mapping_generation
         AND mapping.allowed_role_id = session.allowed_role_id
         AND role.enabled AND role.id = session.allowed_role_id
         AND role.connection_id = session.connection_id
         AND live_role.rolname <> session_user
         AND NOT live_role.rolsuper
         AND NOT live_role.rolcreaterole
         AND NOT live_role.rolcreatedb
         AND NOT live_role.rolcanlogin
         AND NOT live_role.rolreplication
         AND NOT live_role.rolbypassrls
    `, [input.sessionId, input.identityId, input.connectionId, input.historyScopeId]);
    return Boolean(result.rows[0]?.allowed);
  }

  async claim(input: {
    authority: OperationAuthority;
    leaseOwner: string;
    leaseToken: string;
    leaseTokenDigest: string;
    leaseSeconds: number;
    jobId?: string;
  }) {
    const claimed = await this.database.execute<StoredOperationRow>(`
      WITH candidate AS MATERIALIZED (
        SELECT job.id, job.state, job.attempts
          FROM tabular.operation_jobs job
         WHERE job.authority_scope = ?
           AND job.attempts < job.max_attempts
           AND job.cancel_requested_at IS NULL
           AND (
             (job.state IN ('queued', 'retrying') AND job.available_at <= clock_timestamp())
             OR (job.state = 'running' AND job.lease_expires_at <= clock_timestamp())
           )
           ${input.jobId ? 'AND job.id = ?' : ''}
         ORDER BY job.available_at, job.sequence
         FOR UPDATE OF job SKIP LOCKED
         LIMIT 1
      ), expired AS (
        UPDATE tabular.operation_attempts attempt
           SET outcome = 'lease-expired', finished_at = clock_timestamp(),
               diagnostics = jsonb_build_object('reason', 'lease-expired')
          FROM candidate
         WHERE candidate.state = 'running'
           AND attempt.job_id = candidate.id
           AND attempt.attempt_number = candidate.attempts
           AND attempt.finished_at IS NULL
         RETURNING attempt.job_id
      )
      UPDATE tabular.operation_jobs job
         SET state = 'running', attempts = job.attempts + 1,
             lease_owner = ?, lease_token = ?,
             lease_expires_at = clock_timestamp() + (? * interval '1 second'),
             heartbeat_at = clock_timestamp(),
             started_at = COALESCE(job.started_at, clock_timestamp()),
             error_summary = NULL, version = job.version + 1,
             updated_at = clock_timestamp()
        FROM candidate
       WHERE job.id = candidate.id
      RETURNING ${OPERATION_COLUMNS}
    `, [
      input.authority,
      ...(input.jobId ? [input.jobId] : []),
      input.leaseOwner,
      input.leaseToken,
      input.leaseSeconds
    ]);
    const job = claimed.rows[0];
    if (!job) return undefined;
    await this.database.execute(`
      INSERT INTO tabular.operation_attempts (
        job_id, attempt_number, lease_owner, lease_token_digest
      ) VALUES (?, ?, ?, ?)
    `, [job.id, job.attempts, input.leaseOwner, input.leaseTokenDigest]);
    return job;
  }

  async recoverExpired(authority: OperationAuthority, limit: number) {
    const result = await this.database.execute<StoredOperationRow>(`
      WITH candidate AS MATERIALIZED (
        SELECT job.id, job.attempts, job.cancel_requested_at
          FROM tabular.operation_jobs job
         WHERE job.authority_scope = ?
           AND job.state = 'running' AND job.lease_expires_at <= clock_timestamp()
           AND (job.cancel_requested_at IS NOT NULL OR job.attempts >= job.max_attempts)
         ORDER BY job.lease_expires_at, job.sequence
         FOR UPDATE OF job SKIP LOCKED
         LIMIT ?
      ), closed AS (
        UPDATE tabular.operation_attempts attempt
           SET outcome = CASE WHEN candidate.cancel_requested_at IS NULL
                              THEN 'dead-letter' ELSE 'cancelled' END,
               finished_at = clock_timestamp(),
               diagnostics = jsonb_build_object('reason', 'lease-expired')
          FROM candidate
         WHERE attempt.job_id = candidate.id
           AND attempt.attempt_number = candidate.attempts
           AND attempt.finished_at IS NULL
         RETURNING attempt.job_id
      )
      UPDATE tabular.operation_jobs job
         SET state = CASE WHEN candidate.cancel_requested_at IS NULL
                          THEN 'dead-letter' ELSE 'cancelled' END,
             error_summary = CASE WHEN candidate.cancel_requested_at IS NULL
               THEN jsonb_build_object(
                 'code', 'lease_expired',
                 'message', 'The worker lease expired before the operation completed.',
                 'retryable', false
               ) ELSE NULL END,
             lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
             heartbeat_at = NULL, finished_at = clock_timestamp(),
             version = job.version + 1, updated_at = clock_timestamp()
        FROM candidate
       WHERE job.id = candidate.id
      RETURNING ${OPERATION_COLUMNS}
    `, [authority, limit]);
    return result.rows;
  }

  async heartbeat(input: {
    jobId: string;
    leaseOwner: string;
    leaseToken: string;
    leaseSeconds: number;
    progress?: number;
  }) {
    const withProgress = typeof input.progress !== 'undefined';
    const values: Array<string | number> = withProgress
      ? [input.leaseSeconds, input.progress as number, input.jobId, input.leaseOwner, input.leaseToken]
      : [input.leaseSeconds, input.jobId, input.leaseOwner, input.leaseToken];
    const result = await this.database.execute(`
      UPDATE tabular.operation_jobs
         SET lease_expires_at = clock_timestamp() + (? * interval '1 second'),
             heartbeat_at = clock_timestamp()
             ${withProgress ? ', progress = ?, version = version + 1, updated_at = clock_timestamp()' : ''}
       WHERE id = ? AND state = 'running'
         AND lease_owner = ? AND lease_token = ?
         AND lease_expires_at > clock_timestamp()
         AND cancel_requested_at IS NULL
    `, values);
    return result.affectedRows === 1;
  }

  async markIrreversible(jobId: string, leaseOwner: string, leaseToken: string) {
    const result = await this.database.execute(`
      UPDATE tabular.operation_jobs
         SET irreversible_at = COALESCE(irreversible_at, clock_timestamp()),
             version = version + CASE WHEN irreversible_at IS NULL THEN 1 ELSE 0 END,
             updated_at = clock_timestamp()
       WHERE id = ? AND state = 'running'
         AND lease_owner = ? AND lease_token = ?
         AND lease_expires_at > clock_timestamp()
         AND cancel_requested_at IS NULL
         AND irreversible_at IS NULL
    `, [jobId, leaseOwner, leaseToken]);
    return result.affectedRows === 1;
  }

  async requestCancellation(jobId: string) {
    const result = await this.database.execute<StoredOperationRow>(`
      UPDATE tabular.operation_jobs job
         SET state = CASE WHEN state IN ('queued', 'retrying') THEN 'cancelled' ELSE state END,
             cancel_requested_at = clock_timestamp(),
             finished_at = CASE WHEN state IN ('queued', 'retrying')
                                THEN clock_timestamp() ELSE finished_at END,
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ?
         AND state IN ('queued', 'retrying', 'running')
         AND irreversible_at IS NULL
      RETURNING ${OPERATION_COLUMNS}
    `, [jobId]);
    return result.rows[0];
  }

  async finish(input: {
    jobId: string;
    leaseOwner: string;
    leaseToken: string;
    state: Extract<OperationState, 'succeeded' | 'failed' | 'retrying' | 'cancelled' | 'dead-letter'>;
    progress: number;
    availableAt?: Date;
    availableAfterMs?: number;
    result?: Record<string, unknown>;
    resultFileId?: string;
    error?: Record<string, unknown>;
    diagnostics: Record<string, unknown>;
  }) {
    const result = await this.database.execute<StoredOperationRow>(`
      UPDATE tabular.operation_jobs job
         SET state = ?, progress = ?, available_at = CASE
               WHEN ?::integer IS NOT NULL
               THEN transaction_timestamp() + (? * interval '1 millisecond')
               ELSE COALESCE(?, available_at)
             END,
             result_summary = ?::jsonb, error_summary = ?::jsonb,
             diagnostics = ?::jsonb,
             file_id = CASE
               WHEN ? = 'succeeded'
                AND job.kind IN ('import.commit', 'ddl.apply')
                AND ?::text IS NOT NULL
               THEN ? ELSE job.file_id
             END,
             lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
             heartbeat_at = NULL,
             irreversible_at = CASE WHEN ? = 'retrying' THEN NULL ELSE irreversible_at END,
             finished_at = CASE WHEN ? IN ('retrying') THEN NULL ELSE clock_timestamp() END,
             version = version + 1, updated_at = transaction_timestamp()
       WHERE id = ? AND state = 'running'
         AND lease_owner = ? AND lease_token = ?
         AND lease_expires_at > clock_timestamp()
         AND (cancel_requested_at IS NULL OR ? = 'cancelled')
      RETURNING ${OPERATION_COLUMNS}
    `, [
      input.state,
      input.progress,
      input.availableAfterMs ?? null,
      input.availableAfterMs ?? 0,
      input.availableAt || null,
      input.result ? JSON.stringify(input.result) : null,
      input.error ? JSON.stringify(input.error) : null,
      JSON.stringify(input.diagnostics),
      input.state,
      input.resultFileId || null,
      input.resultFileId || null,
      input.state,
      input.state,
      input.jobId,
      input.leaseOwner,
      input.leaseToken,
      input.state
    ]);
    const job = result.rows[0];
    if (!job) return undefined;
    await this.database.execute(`
      UPDATE tabular.operation_attempts
         SET outcome = ?, finished_at = clock_timestamp(),
             error_summary = ?::jsonb, diagnostics = ?::jsonb
       WHERE job_id = ? AND attempt_number = ? AND finished_at IS NULL
    `, [
      input.state,
      input.error ? JSON.stringify(input.error) : null,
      JSON.stringify(input.diagnostics),
      job.id,
      job.attempts
    ]);
    return job;
  }

  async markRead(jobId: string, identityId: string) {
    const result = await this.database.execute<{ read_at: Date | string }>(`
      INSERT INTO tabular.operation_reads (job_id, identity_id, read_at)
      VALUES (?, ?, clock_timestamp())
      ON CONFLICT (job_id, identity_id) DO UPDATE
      SET read_at = clock_timestamp()
      RETURNING read_at
    `, [jobId, identityId]);
    return required(result.rows[0], 'Operation read marker was not returned').read_at;
  }

  async acknowledge(jobId: string, identityId: string) {
    const result = await this.database.execute<StoredOperationRow>(`
      UPDATE tabular.operation_jobs job
         SET acknowledged_at = COALESCE(acknowledged_at, clock_timestamp()),
             acknowledged_by_identity_id = COALESCE(acknowledged_by_identity_id, ?),
             version = version + CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END,
             updated_at = clock_timestamp()
       WHERE id = ? AND state IN ('failed', 'dead-letter')
      RETURNING ${OPERATION_COLUMNS}
    `, [identityId, jobId]);
    const job = result.rows[0];
    if (job) await this.markRead(jobId, identityId);
    return job;
  }

  async retry(jobId: string, additionalAttempts: number) {
    const result = await this.database.execute<StoredOperationRow>(`
      UPDATE tabular.operation_jobs job
         SET state = 'queued',
             max_attempts = LEAST(20, GREATEST(max_attempts, attempts + ?)),
             available_at = clock_timestamp(), finished_at = NULL,
             cancel_requested_at = NULL, irreversible_at = NULL,
             result_summary = NULL, error_summary = NULL,
             acknowledged_at = NULL, acknowledged_by_identity_id = NULL,
             progress = 0, version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state IN ('failed', 'dead-letter') AND attempts < 20
      RETURNING ${OPERATION_COLUMNS}
    `, [additionalAttempts, jobId]);
    return result.rows[0];
  }

  async streamState(connectionId: string) {
    const result = await this.database.execute<{
      retained_from_cursor: string | number;
      high_water: string | number;
    }>(`
      SELECT retained_from_cursor, next_cursor - 1 AS high_water
        FROM tabular.change_streams
       WHERE connection_id = ?
    `, [connectionId]);
    return result.rows[0]
      ? {
        retainedFrom: Number(result.rows[0].retained_from_cursor),
        highWater: Number(result.rows[0].high_water)
      }
      : { retainedFrom: 1, highWater: 0 };
  }

  async events(connectionId: string, after: number, limit: number) {
    const result = await this.database.execute<StoredOperationEventRow>(`
      SELECT sequence, file_id, audience_identity_id, event_type, payload, created_at
        FROM tabular.outbox_events
       WHERE connection_id = ? AND sequence > ?
       ORDER BY sequence
       LIMIT ?
    `, [connectionId, after, limit]);
    return result.rows;
  }

  async retain(input: { connectionId: string; retentionDays: number; limit: number }) {
    const jobs = await this.database.execute<{
      id: string;
      connection_id: string;
      actor_identity_id: string;
      idempotency_key: string;
      state: OperationState;
      acknowledged_at: Date | string | null;
    }>(`
      WITH candidate AS MATERIALIZED (
        SELECT job.id
          FROM tabular.operation_jobs job
         WHERE job.state IN ('succeeded', 'failed', 'cancelled', 'dead-letter')
           AND job.connection_id = ?
           AND job.retained_until <= clock_timestamp()
           AND job.finished_at < clock_timestamp() - (? * interval '1 day')
           AND job.lease_token IS NULL AND job.lease_expires_at IS NULL
         ORDER BY job.finished_at, job.sequence
         FOR UPDATE OF job SKIP LOCKED
         LIMIT ?
      ), tombstoned AS (
        UPDATE tabular.operation_idempotency tombstone
           SET active_job_id = NULL,
               terminal_state = job.state,
               acknowledged_at = job.acknowledged_at,
               retired_at = clock_timestamp()
          FROM tabular.operation_jobs job
          JOIN candidate ON candidate.id = job.id
         WHERE tombstone.connection_id = job.connection_id
           AND tombstone.actor_identity_id = job.actor_identity_id
           AND tombstone.idempotency_key = job.idempotency_key
         RETURNING job.id
      )
      DELETE FROM tabular.operation_jobs job
       USING candidate
       WHERE job.id = candidate.id
      RETURNING job.id, job.connection_id, job.actor_identity_id,
                job.idempotency_key, job.state, job.acknowledged_at
    `, [input.connectionId, input.retentionDays, input.limit]);
    const events = await this.database.execute<{ connection_id: string; sequence: string | number }>(`
      WITH stream AS MATERIALIZED (
        SELECT retained_from_cursor
          FROM tabular.change_streams
         WHERE connection_id = ?
         FOR UPDATE
      ), bounded AS MATERIALIZED (
        SELECT event.connection_id, event.sequence, event.created_at,
               stream.retained_from_cursor
          FROM tabular.outbox_events event
          CROSS JOIN stream
         WHERE event.connection_id = ?
           AND event.sequence >= stream.retained_from_cursor
         ORDER BY event.sequence
         LIMIT ?
      ), ordered AS MATERIALIZED (
        SELECT bounded.*,
               row_number() OVER (ORDER BY bounded.sequence) AS ordinal
          FROM bounded
      ), candidate AS MATERIALIZED (
        SELECT connection_id, sequence
          FROM (
            SELECT ordered.*,
                   bool_and(
                     sequence = retained_from_cursor + ordinal - 1
                     AND created_at < clock_timestamp() - (? * interval '1 day')
                   ) OVER (
                     ORDER BY sequence
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                   ) AS is_retained_prefix
              FROM ordered
          ) scanned
         WHERE is_retained_prefix
         ORDER BY sequence
         LIMIT ?
      )
      DELETE FROM tabular.outbox_events event
       USING candidate
       WHERE event.connection_id = candidate.connection_id
         AND event.sequence = candidate.sequence
      RETURNING event.connection_id, event.sequence
    `, [
      input.connectionId,
      input.connectionId,
      input.limit * 10,
      input.retentionDays,
      input.limit * 10
    ]);
    const connections = [...new Set(events.rows.map((row) => row.connection_id))];
    for (const connectionId of connections) {
      await this.database.execute(`
        UPDATE tabular.change_streams stream
           SET retained_from_cursor = GREATEST(
                 stream.retained_from_cursor,
                 COALESCE((
                   SELECT min(event.sequence)
                     FROM tabular.outbox_events event
                    WHERE event.connection_id = stream.connection_id
                 ), stream.next_cursor)
               ),
               updated_at = clock_timestamp()
         WHERE stream.connection_id = ?
      `, [connectionId]);
    }
    return {
      jobsDeleted: jobs.rows.length,
      eventsDeleted: events.rows.length,
      cursorFloorsAdvanced: connections.length
    };
  }
}

function required<Value>(value: Value | undefined, message: string): Value {
  if (typeof value === 'undefined') throw new Error(message);
  return value;
}

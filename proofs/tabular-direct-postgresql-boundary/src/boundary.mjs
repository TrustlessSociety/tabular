import connect from '@stackpress/inquire-pg';

const PROOF_ROLES = new Set(['tabular_member', 'tabular_other']);
const MIGRATION_LOCK = '821630003';

function checkedRole(role) {
  if (!PROOF_ROLES.has(role)) {
    throw new Error(`Role is not allowlisted: ${role}`);
  }
  return `"${role}"`;
}

export function engineFor(client) {
  return connect(client);
}

export async function withRoleTransaction(
  pool,
  role,
  callback,
  { statementTimeout = '5s' } = {}
) {
  const client = await pool.connect();
  const engine = engineFor(client);
  let cleanupError;

  try {
    return await engine.transaction(async connection => {
      await connection.raw({ query: `SET LOCAL ROLE ${checkedRole(role)}` });
      await connection.raw({
        query: "SELECT set_config('statement_timeout', ?, true)",
        values: [statementTimeout]
      });
      return callback(connection);
    });
  } finally {
    try {
      await client.query('RESET ROLE');
      await client.query('RESET ALL');
      const state = await client.query(`
        SELECT
          current_user,
          session_user,
          current_setting('statement_timeout') AS statement_timeout
      `);
      const row = state.rows[0];
      if (row.current_user !== row.session_user || row.statement_timeout !== '0') {
        throw new Error(`Unsafe pooled state: ${JSON.stringify(row)}`);
      }
    } catch (error) {
      cleanupError = error;
    }
    client.release(cleanupError);
    if (cleanupError) throw cleanupError;
  }
}

export async function readRecordsForRole(pool, role) {
  return withRoleTransaction(pool, role, async connection => {
    const result = await connection.raw({
      query: 'SELECT id, owner_role, title, version FROM proof.records ORDER BY id'
    });
    return result.rows;
  });
}

export async function applyMigration(pool, version, statements) {
  const client = await pool.connect();
  const engine = engineFor(client);
  try {
    return await engine.transaction(async connection => {
      await connection.raw({
        query: 'SELECT pg_advisory_xact_lock(?)',
        values: [MIGRATION_LOCK]
      });
      await connection.raw({ query: `
        CREATE TABLE IF NOT EXISTS proof.schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      ` });
      const existing = await connection.raw({
        query: 'SELECT version FROM proof.schema_migrations WHERE version = ?',
        values: [version]
      });
      if (existing.rows.length) return { applied: false, version };
      for (const query of statements) {
        await connection.raw({ query });
      }
      await connection.raw({
        query: 'INSERT INTO proof.schema_migrations (version) VALUES (?)',
        values: [version]
      });
      return { applied: true, version };
    });
  } finally {
    client.release();
  }
}

export async function claimJob(pool, worker, lease = '30 seconds') {
  const client = await pool.connect();
  const engine = engineFor(client);
  try {
    return await engine.transaction(async connection => {
      const result = await connection.raw({
        query: `
          WITH candidate AS (
            SELECT id
            FROM proof.jobs
            WHERE available_at <= now()
              AND (
                status = 'pending'
                OR (status = 'running' AND lease_expires_at <= now())
              )
            ORDER BY id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE proof.jobs AS job
          SET status = 'running',
              attempts = job.attempts + 1,
              worker = ?,
              lease_expires_at = now() + ?::interval
          FROM candidate
          WHERE job.id = candidate.id
          RETURNING job.*
        `,
        values: [worker, lease]
      });
      return result.rows[0] ?? null;
    });
  } finally {
    client.release();
  }
}

export async function failJob(pool, id, message) {
  const client = await pool.connect();
  const engine = engineFor(client);
  try {
    return await engine.transaction(async connection => {
      const result = await connection.raw({
        query: `
          UPDATE proof.jobs
          SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
              available_at = now(),
              lease_expires_at = NULL,
              worker = NULL,
              last_error = ?
          WHERE id = ? AND status = 'running'
          RETURNING *
        `,
        values: [message, id]
      });
      return result.rows[0];
    });
  } finally {
    client.release();
  }
}

export async function enqueueIdempotent(pool, key, payload) {
  const client = await pool.connect();
  const engine = engineFor(client);
  try {
    const result = await engine.connection.raw({
      query: `
        INSERT INTO proof.jobs (idempotency_key, payload)
        VALUES (?, ?::jsonb)
        ON CONFLICT (idempotency_key)
        DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
        RETURNING id
      `,
      values: [key, JSON.stringify(payload)]
    });
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

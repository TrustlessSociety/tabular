import { PGlite } from '@electric-sql/pglite';
import connect from '@stackpress/inquire-pglite';

export type SessionRow = {
  id: string;
  subject: string;
  database_role: string;
  csrf_token: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
};

export type ProofRecord = {
  id: number;
  name: string;
  version: number;
};

export async function createProofDatabase() {
  const resource = new PGlite();
  const engine = connect(resource);

  await engine.transaction(async (tx) => {
    await tx.query({ query: 'CREATE SCHEMA IF NOT EXISTS tabular' });
    await tx.query({
      query: `CREATE TABLE IF NOT EXISTS tabular.schema_migration (
        version INTEGER PRIMARY KEY,
        installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    });
    const applied = await tx.query<{ version: number }>({
      query: 'SELECT version FROM tabular.schema_migration WHERE version = ?',
      values: [1]
    });
    if (applied.length === 0) {
      await tx.query({
        query: `CREATE TABLE tabular.proof_session (
          id TEXT PRIMARY KEY,
          subject TEXT NOT NULL,
          database_role TEXT NOT NULL,
          csrf_token TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          last_seen_at TIMESTAMPTZ NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        )`
      });
      await tx.query({
        query: `CREATE TABLE tabular.proof_record (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          version INTEGER NOT NULL CHECK (version > 0)
        )`
      });
      await tx.query({
        query: `INSERT INTO tabular.proof_record (id, name, version)
          VALUES (?, ?, ?)`,
        values: [1, 'Quarterly Plan', 1]
      });
      await tx.query({
        query: 'INSERT INTO tabular.schema_migration (version) VALUES (?)',
        values: [1]
      });
    }
  });

  return {
    engine,
    resource,
    async close() {
      await resource.close();
    },
    async migrationCount() {
      const rows = await engine.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM tabular.schema_migration'
      );
      return rows[0].count;
    },
    async createSession(row: SessionRow) {
      await engine.query(
        `INSERT INTO tabular.proof_session
          (id, subject, database_role, csrf_token, created_at, last_seen_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.subject,
          row.database_role,
          row.csrf_token,
          row.created_at,
          row.last_seen_at,
          row.expires_at
        ]
      );
    },
    async findActiveSession(id: string, now = new Date()) {
      const rows = await engine.query<SessionRow>(
        `SELECT * FROM tabular.proof_session
         WHERE id = ? AND expires_at > ?`,
        [id, now.toISOString()]
      );
      if (!rows[0]) return undefined;
      const idleLimit = new Date(now.getTime() - 10 * 60 * 1000);
      if (new Date(rows[0].last_seen_at) <= idleLimit) {
        await engine.query('DELETE FROM tabular.proof_session WHERE id = ?', [id]);
        return undefined;
      }
      await engine.query(
        'UPDATE tabular.proof_session SET last_seen_at = ? WHERE id = ?',
        [now.toISOString(), id]
      );
      return rows[0];
    },
    async findSession(id: string) {
      const rows = await engine.query<SessionRow>(
        'SELECT * FROM tabular.proof_session WHERE id = ?',
        [id]
      );
      return rows[0];
    },
    async revokeSession(id: string) {
      await engine.query('DELETE FROM tabular.proof_session WHERE id = ?', [id]);
    },
    async readRecord(id = 1) {
      const rows = await engine.query<ProofRecord>(
        'SELECT id, name, version FROM tabular.proof_record WHERE id = ?',
        [id]
      );
      return rows[0];
    }
  };
}

export type ProofDatabase = Awaited<ReturnType<typeof createProofDatabase>>;

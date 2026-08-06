import { PGlite } from '@electric-sql/pglite';

export async function createDatabase(setupSql = '') {
  const db = new PGlite();
  if (setupSql) {
    await db.exec(setupSql);
  }
  return db;
}

export async function closeDatabase(db) {
  await db.close();
}

export async function one(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0];
}

export async function rows(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

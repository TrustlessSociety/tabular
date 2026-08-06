//node
import { createHash } from 'node:crypto';

//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { ExpectedDdlContext } from './contracts.js';

type RelationIdentity = {
  relation_oid: string | number,
  namespace_oid: string | number,
  schema_name: string,
  relation_name: string,
  owner_oid: string | number,
  owner_name: string,
  relkind: string,
  relrowsecurity: boolean,
  relforcerowsecurity: boolean,
};

/**
 * Read the expected fingerprint.
 */
export async function readExpectedFingerprint(
  database: DatabaseExecutor,
  expected: ExpectedDdlContext
) {
  if (!expected.relationOid) {
    const schema = await database.execute<{
      database_oid: string | number,
      namespace_oid: string | number,
      schema_name: string,
      owner_oid: string | number,
      owner_name: string,
    }>(`
      SELECT d.oid AS database_oid, n.oid AS namespace_oid, n.nspname AS schema_name,
             r.oid AS owner_oid, r.rolname::text AS owner_name
        FROM pg_database d
        JOIN pg_namespace n ON n.oid = ?::oid AND n.nspname = ?
        JOIN pg_roles r ON r.oid = n.nspowner
       WHERE d.datname = current_database()
    `, [expected.namespaceOid!, expected.schemaName!]);
    return digest(schema.rows[0] || null);
  }
  return readRelationFingerprint(database, expected.relationOid);
}

/**
 * Read the relation fingerprint.
 */
export async function readRelationFingerprint(
  database: DatabaseExecutor,
  relationOid: string
) {
  const identity = await database.execute<RelationIdentity>(`
    SELECT c.oid AS relation_oid, n.oid AS namespace_oid,
           n.nspname AS schema_name, c.relname AS relation_name,
           r.oid AS owner_oid, r.rolname::text AS owner_name, c.relkind,
           c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
     WHERE c.oid = ?::oid AND c.relkind IN ('r', 'p')
  `, [relationOid]);
  const relation = identity.rows[0];
  if (!relation) return digest(null);
  const [columns, constraints, indexes, triggers] = await Promise.all([
    database.execute(`
      SELECT a.attnum, a.attname, a.atttypid::text, a.atttypmod,
             a.attcollation::text, a.attnotnull, a.attidentity, a.attgenerated,
             CASE WHEN d.oid IS NULL THEN NULL ELSE pg_get_expr(d.adbin, d.adrelid) END AS default_expression
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = ?::oid AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum
    `, [relationOid]),
    database.execute(`
      SELECT c.oid::text AS oid, c.conname, c.contype, c.conkey::text,
             c.confrelid::text, c.confkey::text, c.confupdtype, c.confdeltype,
             c.confmatchtype, c.condeferrable, c.condeferred, c.convalidated,
             pg_get_constraintdef(c.oid, false) AS definition
        FROM pg_constraint c
       WHERE c.conrelid = ?::oid
       ORDER BY c.oid
    `, [relationOid]),
    database.execute(`
      SELECT i.indexrelid::text AS oid, i.indisunique, i.indisprimary,
             i.indisvalid, i.indisready, i.indimmediate, i.indnkeyatts,
             i.indkey::text, pg_get_expr(i.indpred, i.indrelid) AS predicate,
             pg_get_expr(i.indexprs, i.indrelid) AS expressions
        FROM pg_index i
       WHERE i.indrelid = ?::oid
       ORDER BY i.indexrelid
    `, [relationOid]),
    database.execute(`
      SELECT t.oid::text AS oid, t.tgname, pg_get_triggerdef(t.oid, false) AS definition
        FROM pg_trigger t
       WHERE t.tgrelid = ?::oid AND NOT t.tgisinternal
       ORDER BY t.oid
    `, [relationOid])
  ]);
  return digest({
    relation,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows
  });
}

/**
 * Derive the safe owner.
 */
export async function deriveSafeOwner(
  database: DatabaseExecutor,
  expected: ExpectedDdlContext
) {
  const result = await database.execute<{
    owner_oid: string | number,
    owner_name: string,
    usable: boolean,
    create_allowed: boolean,
    rolcanlogin: boolean,
    rolsuper: boolean,
    rolcreaterole: boolean,
    rolcreatedb: boolean,
    rolreplication: boolean,
    rolbypassrls: boolean,
  }>(expected.relationOid ? `
    SELECT r.oid AS owner_oid, r.rolname::text AS owner_name,
           pg_has_role(current_user, r.oid, 'USAGE') AS usable,
           false AS create_allowed, r.rolcanlogin, r.rolsuper, r.rolcreaterole,
           r.rolcreatedb, r.rolreplication, r.rolbypassrls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
     WHERE c.oid = ?::oid AND c.relname = ? AND n.nspname = ?
       AND c.relkind IN ('r', 'p')
  ` : `
    SELECT r.oid AS owner_oid, r.rolname::text AS owner_name,
           pg_has_role(current_user, r.oid, 'USAGE') AS usable,
           has_schema_privilege(current_user, n.oid, 'CREATE') AS create_allowed,
           r.rolcanlogin, r.rolsuper, r.rolcreaterole, r.rolcreatedb,
           r.rolreplication, r.rolbypassrls
      FROM pg_namespace n
      JOIN pg_roles r ON r.oid = n.nspowner
     WHERE n.oid = ?::oid AND n.nspname = ?
  `, expected.relationOid
    ? [expected.relationOid, expected.relationName!, expected.schemaName!]
    : [expected.namespaceOid!, expected.schemaName!]);
  const owner = result.rows[0];
  if (!owner || !owner.usable || (!expected.relationOid && !owner.create_allowed)) return undefined;
  if (owner.rolcanlogin || owner.rolsuper || owner.rolcreaterole || owner.rolcreatedb
    || owner.rolreplication || owner.rolbypassrls) return undefined;
  return { oid: String(owner.owner_oid), name: owner.owner_name };
}

/**
 * Return the digest result.
 */
function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

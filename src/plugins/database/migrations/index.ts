//node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

//The migration contract exported for module callers
export type Migration = {
  version: string,
  name: string,
  checksum: string,
  sql: string,
};

const migrationFiles = [
  { version: '0001', name: 'foundation', file: '0001-foundation.sql' },
  { version: '0002', name: 'identity-catalog', file: '0002-identity-catalog.sql' },
  { version: '0003', name: 'capability-action-kernel', file: '0003-capability-action-kernel.sql' },
  { version: '0004', name: 'file-ddl-lifecycles', file: '0004-file-ddl-lifecycles.sql' },
  { version: '0005', name: 'grid-record-actions', file: '0005-grid-record-actions.sql' },
  {
    version: '0006',
    name: 'draft-row-identity-constraint',
    file: '0006-draft-row-identity-constraint.sql'
  },
  {
    version: '0007',
    name: 'realtime-saved-views-row-order',
    file: '0007-realtime-saved-views-row-order.sql'
  },
  {
    version: '0008',
    name: 'import-export',
    file: '0008-import-export.sql'
  },
  {
    version: '0009',
    name: 'operations',
    file: '0009-operations.sql'
  },
  {
    version: '0010',
    name: 'postgresql-human-authentication',
    file: '0010-postgresql-human-authentication.sql'
  },
  {
    version: '0011',
    name: 'sparse-row-drafts',
    file: '0011-sparse-row-drafts.sql'
  },
  {
    version: '0012',
    name: 'field-validator-metadata',
    file: '0012-field-validator-metadata.sql'
  }
] as const;

/**
 * Load the migrations.
 */
export async function loadMigrations(): Promise<Migration[]> {
  const migrations = await Promise.all(migrationFiles.map(async (migration) => {
    const sql = await fs.readFile(new URL(migration.file, import.meta.url), 'utf8');
    return {
      version: migration.version,
      name: migration.name,
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql
    };
  }));
  const versions = migrations.map((migration) => migration.version);
  if (new Set(versions).size !== versions.length) {
    throw new Error('Migration versions must be unique');
  }
  if ([...versions].sort().join(',') !== versions.join(',')) {
    throw new Error('Migrations must be declared in ascending version order');
  }
  return migrations;
}

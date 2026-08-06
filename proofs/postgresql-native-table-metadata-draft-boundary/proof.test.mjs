import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase, closeDatabase, one, rows } from '../lib/database.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import {
  catalog,
  NativeTableService,
  setupNativeTableProof
} from './service.mjs';

test('P-007 real tables, stable metadata, drafts, drift, keys, and permissions', async () => {
  const db = await createDatabase();
  try {
    await setupNativeTableProof(db);
    const service = new NativeTableService(db);
    const databaseVersion = await one(db, 'SELECT version()');

    const created = await service.createSpreadsheet('workspace', 'new_sheet');
    const header = await service.addHeader(created.id, 'Untitled');
    assert.equal(header.observed_type, 'text');
    assert.equal(header.field_type, 'text');
    await service.setPresentation(created.id, 'Untitled', 'email', 'email-link');
    const presented = await one(
      db,
      `SELECT field_type, output_format
       FROM tabular.column_metadata
       WHERE table_id = $1 AND column_name = 'Untitled'`,
      [created.id]
    );
    assert.deepEqual(presented, {
      field_type: 'email',
      output_format: 'email-link'
    });
    assert.equal(
      (await catalog.columns(db, created.relation_oid)).find(
        (column) => column.column_name === 'Untitled'
      ).data_type,
      'text'
    );

    const contacts = await service.register('workspace', 'contacts');
    const orderItems = await service.register('workspace', 'order_items');
    const noKey = await service.register('workspace', 'no_key');
    const legacyBefore = await catalog.columns(
      db,
      (await catalog.table(db, 'workspace', 'legacy_records')).relation_oid
    );
    const legacy = await service.register('workspace', 'legacy_records');
    const legacyAfter = await catalog.columns(db, legacy.relation_oid);
    assert.deepEqual(legacyAfter, legacyBefore);
    assert.deepEqual(
      [contacts.key_kind, orderItems.key_kind, noKey.key_kind],
      ['single', 'composite', 'absent']
    );
    assert.deepEqual(orderItems.key_columns, ['order_id', 'line_no']);

    const relation = await one(
      db,
      `SELECT confrelid = 'workspace.organizations'::regclass AS valid
       FROM pg_constraint
       WHERE conrelid = 'workspace.contacts'::regclass
         AND contype = 'f'`
    );
    assert.equal(relation.valid, true);

    const targetCountBeforeDraft = await one(
      db,
      'SELECT count(*)::integer AS count FROM workspace.contacts'
    );
    const incomplete = await service.createDraft(contacts.id, {
      email: 'draft@example.com'
    });
    const targetCountAfterDraft = await one(
      db,
      'SELECT count(*)::integer AS count FROM workspace.contacts'
    );
    assert.equal(targetCountAfterDraft.count, targetCountBeforeDraft.count);
    await service.updateDraft(incomplete.id, {
      name: 'Draft Contact',
      organization_id: 1,
      price: 19.95
    });
    const promoted = await service.promoteDraft(incomplete.id);
    assert.equal(promoted.status, 'committed');
    assert.equal(promoted.row.display_label, 'Draft Contact <draft@example.com>');
    assert.equal(promoted.row.owner_name, 'tabular_editor');

    const requiredDraft = await service.createDraft(contacts.id, {
      email: 'missing-name@example.com'
    });
    const requiredFailure = await service.promoteDraft(requiredDraft.id);
    assert.equal(requiredFailure.status, 'rejected');
    assert.deepEqual(requiredFailure.error.fields, ['name']);

    const checkDraft = await service.createDraft(contacts.id, {
      name: 'Negative',
      email: 'negative@example.com',
      price: -1
    });
    const checkFailure = await service.promoteDraft(checkDraft.id);
    assert.equal(checkFailure.status, 'rejected');
    assert.deepEqual(checkFailure.error.fields, ['price']);

    const uniqueDraft = await service.createDraft(contacts.id, {
      name: 'Duplicate',
      email: 'draft@example.com',
      price: 1
    });
    const uniqueFailure = await service.promoteDraft(uniqueDraft.id);
    assert.equal(uniqueFailure.status, 'rejected');
    assert.deepEqual(uniqueFailure.error.fields, ['email']);

    const triggerDraft = await service.createDraft(contacts.id, {
      name: 'Blocked',
      email: 'blocked@example.com',
      price: 1
    });
    const triggerFailure = await service.promoteDraft(triggerDraft.id);
    assert.equal(triggerFailure.status, 'rejected');
    assert.deepEqual(triggerFailure.error.fields, ['name']);
    const openFailures = await one(
      db,
      `SELECT count(*)::integer AS count
       FROM tabular.drafts
       WHERE id IN ($1, $2, $3, $4) AND state = 'open' AND error IS NOT NULL`,
      [requiredDraft.id, checkDraft.id, uniqueDraft.id, triggerDraft.id]
    );
    assert.equal(openFailures.count, 4);
    assert.equal(
      (await one(db, 'SELECT count(*)::integer AS count FROM workspace.contacts')).count,
      1
    );

    const contactsSecurityBefore = await catalog.table(
      db,
      'workspace',
      'contacts'
    );
    const drift = await service.register('workspace', 'drift_fixture');
    const driftColumnsBefore = await rows(
      db,
      `SELECT id, attnum, column_name
       FROM tabular.column_metadata
       WHERE table_id = $1 ORDER BY attnum`,
      [drift.id]
    );
    await db.exec(`
      ALTER TABLE workspace.drift_fixture RENAME TO drift_renamed;
      ALTER TABLE workspace.drift_renamed RENAME COLUMN old_name TO title;
      ALTER TABLE workspace.drift_renamed
        ALTER COLUMN quantity TYPE bigint;
      ALTER TABLE workspace.drift_renamed DROP COLUMN to_drop;
      ALTER TABLE workspace.drift_renamed ADD COLUMN fresh boolean;
    `);
    const driftEvents = await service.reconcile(drift.id);
    assert.deepEqual(
      new Set(driftEvents.map((event) => event.kind)),
      new Set([
        'table-renamed',
        'column-renamed',
        'column-type-changed',
        'column-dropped',
        'column-added'
      ])
    );
    const driftMetadata = await one(
      db,
      'SELECT * FROM tabular.table_metadata WHERE id = $1',
      [drift.id]
    );
    assert.equal(driftMetadata.relation_oid, drift.relation_oid);
    const renamedColumn = await one(
      db,
      `SELECT id, attnum, column_name
       FROM tabular.column_metadata
       WHERE table_id = $1 AND column_name = 'title'`,
      [drift.id]
    );
    const oldColumn = driftColumnsBefore.find(
      (column) => column.column_name === 'old_name'
    );
    assert.equal(renamedColumn.id, oldColumn.id);
    assert.equal(renamedColumn.attnum, oldColumn.attnum);

    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec(
          'ALTER TABLE workspace.new_sheet ADD COLUMN partial_write text'
        );
        throw new Error('forced ddl failure');
      }),
      /forced ddl failure/
    );
    const partialColumn = await one(
      db,
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'workspace'
           AND table_name = 'new_sheet'
           AND column_name = 'partial_write'
       ) AS exists`
    );
    assert.equal(partialColumn.exists, false);

    await db.exec(`
      INSERT INTO workspace.contacts(owner_name, name, email, price)
      VALUES ('tabular_other', 'Other Contact', 'other@example.com', 1)
    `);
    const editorVisible = await db.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE tabular_editor');
      return rows(tx, 'SELECT id FROM workspace.contacts ORDER BY id');
    });
    assert.equal(editorVisible.length, 1);
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE tabular_editor');
        await tx.exec(
          'ALTER TABLE workspace.contacts ADD COLUMN widened text'
        );
      }),
      (error) => error.code === '42501'
    );
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE tabular_editor');
        await tx.exec(`
          INSERT INTO workspace.contacts(owner_name, name, email, price)
          VALUES ('tabular_other', 'Cross Owner', 'cross@example.com', 1)
        `);
      }),
      (error) => error.code === '42501'
    );
    const contactsSecurityAfter = await catalog.table(
      db,
      'workspace',
      'contacts'
    );
    assert.deepEqual(
      {
        relrowsecurity: contactsSecurityAfter.relrowsecurity,
        relforcerowsecurity: contactsSecurityAfter.relforcerowsecurity,
        relacl: contactsSecurityAfter.relacl
      },
      {
        relrowsecurity: contactsSecurityBefore.relrowsecurity,
        relforcerowsecurity: contactsSecurityBefore.relforcerowsecurity,
        relacl: contactsSecurityBefore.relacl
      }
    );

    await writeEvidence(
      new URL('./results.json', import.meta.url).pathname,
      {
        proof: 'P-007',
        disposition: 'proved',
        database: databaseVersion.version,
        signals: {
          spreadsheetCreatesRealTable: true,
          headerDefaultsToText: true,
          fieldAndFormatMetadataIndependent: true,
          existingTableOpenedWithoutConversion: true,
          singleCompositeAndAbsentKeysClassified: true,
          foreignKeyIntrospected: true,
          incompleteDraftStaysOutsideTarget: true,
          validDraftPromotesAtomically: true,
          requiredCheckUniqueAndTriggerErrorsMapToCells: true,
          oidAndAttnumIdentitySurviveRename: true,
          dropTypeAndAddDriftDetected: true,
          failedDdlRollsBack: true,
          grantsAndForcedRlsPreserved: true,
          editorCannotWidenSchemaOrCrossRls: true
        },
        driftEvents,
        limitation:
          'PGlite proves PostgreSQL catalog/DDL/transaction/RLS semantics in one process; it does not prove PostgreSQL 18 server connections, pool behavior, external DDL races, or large-schema performance.'
      }
    );
  } finally {
    await closeDatabase(db);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDatabase, closeDatabase, one } from '../lib/database.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import {
  COLUMN_IDS,
  GridContract,
  identityPolicy,
  LogicalGridState,
  ROW_COUNT,
  serializeClipboard,
  setupGridProof
} from './contract.mjs';

test('P-002 bounded windows, identity, batch edits, and logical grid state', async () => {
  const db = await createDatabase();
  try {
    await setupGridProof(db);
    const contract = new GridContract(db);
    const columns = COLUMN_IDS.slice(0, 19).concat('c200');
    const first = await contract.readWindow({ columns });
    const second = await contract.readWindow({
      columns,
      cursor: first.cursor
    });
    assert.equal(first.rows.length, 40);
    assert.equal(second.rows.length, 40);
    assert.equal(
      first.rows.some((row) => second.rows.some((next) => next.id === row.id)),
      false
    );
    assert.ok(Buffer.byteLength(JSON.stringify(first)) < 100_000);

    const filtered = await contract.readWindow({
      columns: ['c001', 'c200'],
      filter: 'even'
    });
    assert.equal(filtered.rows.length, 40);
    assert.equal(filtered.rows.every((row) => row.group_name === 'even'), true);

    const nextRevision = await contract.insertBeforeFirst();
    const stale = await contract.readWindow({
      columns,
      cursor: first.cursor
    });
    assert.deepEqual(stale, {
      status: 'stale-window',
      expectedRevision: 1,
      actualRevision: nextRevision
    });
    const refreshed = await contract.readWindow({
      columns: ['c001'],
      filter: 'even'
    });
    assert.equal(refreshed.rows[0].id, 200001);

    const beforeBatch = await one(
      db,
      'SELECT id, version, c001, c002 FROM workspace.grid_rows WHERE id = 1'
    );
    const row2 = await one(
      db,
      'SELECT id, version FROM workspace.grid_rows WHERE id = 2'
    );
    const failedBatch = await contract.batchEdit(nextRevision, [
      {
        rowId: 1,
        rowVersion: beforeBatch.version,
        patch: { c001: 'must-roll-back' }
      },
      { rowId: 2, rowVersion: row2.version - 1, patch: { c002: 'stale' } }
    ]);
    assert.equal(failedBatch.status, 'conflict');
    const afterFailedBatch = await one(
      db,
      'SELECT version, c001 FROM workspace.grid_rows WHERE id = 1'
    );
    assert.equal(afterFailedBatch.version, beforeBatch.version);
    assert.equal(afterFailedBatch.c001, beforeBatch.c001);

    const committedBatch = await contract.batchEdit(nextRevision, [
      {
        rowId: 1,
        rowVersion: beforeBatch.version,
        patch: { c001: 'edited', c002: 'typed' }
      },
      { rowId: 2, rowVersion: row2.version, patch: { c200: 'edge-edited' } }
    ]);
    assert.equal(committedBatch.status, 'committed');
    const actionCount = await one(
      db,
      'SELECT count(*)::integer AS count FROM tabular.grid_actions'
    );
    assert.equal(actionCount.count, 1);

    assert.deepEqual(identityPolicy(['id']), {
      mode: 'editable',
      key: 'single',
      columns: ['id']
    });
    assert.deepEqual(identityPolicy(['order_id', 'line_no']), {
      mode: 'editable',
      key: 'composite',
      columns: ['order_id', 'line_no']
    });
    assert.deepEqual(identityPolicy([]), {
      mode: 'read-only',
      reason: 'no-stable-key'
    });

    const state = new LogicalGridState(ROW_COUNT, COLUMN_IDS.length);
    state.jump(99_999, 199);
    assert.deepEqual(state.active, { row: 99_999, column: 199 });
    assert.equal(state.isMounted(), false);
    assert.deepEqual(state.ensureMounted(), {
      row: 99_988,
      column: 192
    });
    assert.equal(state.isMounted(), true);

    const clipboard = serializeClipboard({
      columns: [
        { id: 'c001', storageType: 'text' },
        { id: 'c002', storageType: 'numeric' }
      ],
      rows: [
        [
          { kind: 'string', value: 'Alpha' },
          { kind: 'number', value: 12.5 }
        ]
      ]
    });
    assert.equal(clipboard['text/plain'], 'Alpha\t12.5');
    assert.match(clipboard['text/html'], /<table>/);
    assert.deepEqual(
      JSON.parse(clipboard['application/x-tabular+json']).columns,
      [
        { id: 'c001', storageType: 'text' },
        { id: 'c002', storageType: 'numeric' }
      ]
    );

    const plan = await db.query(
      `EXPLAIN (FORMAT JSON)
       SELECT id, c001 FROM workspace.grid_rows
       WHERE group_name = 'even' AND (sort_value, id) > (50000, 50000)
       ORDER BY sort_value, id LIMIT 40`
    );
    const planText = JSON.stringify(plan.rows);
    assert.match(planText, /Index Scan/);

    let browser = {
      status: 'pending',
      required:
        'Fresh Playwright snapshot, keyboard/edit interaction, mounted-cell count, ARIA indices/counts, and screenshot.'
    };
    try {
      browser = JSON.parse(
        await readFile(new URL('./browser-results.json', import.meta.url), 'utf8')
      );
    } catch {
      // The command-backed browser pass is intentionally separate.
    }

    await writeEvidence(
      new URL('./results.json', import.meta.url).pathname,
      {
        proof: 'P-002',
        disposition: browser.status === 'proved' ? 'proved' : 'inconclusive',
        database: 'PGlite / PostgreSQL 17.5 semantics',
        signals: {
          realRows: ROW_COUNT,
          realColumns: COLUMN_IDS.length,
          boundedWindow: '40 rows by 20 columns',
          payloadUnder100Kb: true,
          keysetWindowsDoNotOverlap: true,
          staleCursorRejectedAfterMutation: true,
          indexedFilterAndCursorPlan: true,
          atomicBatchRollback: true,
          successfulBatchHasOneAction: true,
          keyPoliciesExplicit: true,
          logicalSelectionSurvivesUnmount: true,
          typedMultiMimeClipboard: true
        },
        browser
      }
    );
  } finally {
    await closeDatabase(db);
  }
});

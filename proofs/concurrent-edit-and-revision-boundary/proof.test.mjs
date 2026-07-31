import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase, closeDatabase, one, rows } from '../lib/database.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import { RevisionService, setupRevisionProof } from './service.mjs';

test('P-004 expected-version edits, scoped undo, and reconstruction', async () => {
  const db = await createDatabase();
  const service = new RevisionService(db);
  try {
    await setupRevisionProof(db);
    const aliceRow1 = await service.snapshot(1);
    const bobRow1 = await service.snapshot(1);
    const bobRow2 = await service.snapshot(2);

    const aliceUpdate = await service.update({
      actor: 'alice',
      rowId: 1,
      baseVersion: aliceRow1.version,
      patch: { label: 'Alpha A' }
    });
    assert.equal(aliceUpdate.status, 'committed');

    const staleBob = await service.update({
      actor: 'bob',
      rowId: 1,
      baseVersion: bobRow1.version,
      patch: { amount: 11 }
    });
    assert.deepEqual(staleBob, {
      status: 'conflict',
      expectedVersion: 1,
      actualVersion: 2
    });

    const separateRow = await service.update({
      actor: 'bob',
      rowId: 2,
      baseVersion: bobRow2.version,
      patch: { amount: 25 }
    });
    assert.equal(separateRow.status, 'committed');

    const laterWork = await service.update({
      actor: 'alice',
      rowId: 1,
      baseVersion: aliceUpdate.version,
      patch: { amount: 12 }
    });
    assert.equal(laterWork.status, 'committed');

    const unsafeUndo = await service.reverse({
      actor: 'alice',
      actionId: aliceUpdate.actionId,
      baseVersion: laterWork.version,
      mode: 'undo'
    });
    assert.equal(unsafeUndo.status, 'conflict');
    assert.equal(unsafeUndo.reason, 'later-work');

    await service.setCapability('bob', 'row.undo', false);
    const deniedUndo = await service.reverse({
      actor: 'bob',
      actionId: separateRow.actionId,
      baseVersion: separateRow.version,
      mode: 'undo'
    });
    assert.deepEqual(deniedUndo, {
      status: 'denied',
      reason: 'capability'
    });

    await service.setCapability('bob', 'row.undo', true);
    const undo = await service.reverse({
      actor: 'bob',
      actionId: separateRow.actionId,
      baseVersion: separateRow.version,
      mode: 'undo'
    });
    assert.equal(undo.status, 'committed');
    assert.equal(undo.row.amount, 20);

    const redo = await service.reverse({
      actor: 'bob',
      actionId: separateRow.actionId,
      baseVersion: undo.version,
      mode: 'redo'
    });
    assert.equal(redo.status, 'committed');
    assert.equal(redo.row.amount, 25);

    const finalRows = await rows(
      db,
      'SELECT * FROM workspace.records ORDER BY id'
    );
    const reconstructed = await service.reconstruct();
    assert.deepEqual(reconstructed['1'], finalRows[0]);
    assert.deepEqual(reconstructed['2'], finalRows[1]);

    const actionCount = await one(
      db,
      'SELECT count(*)::integer AS count FROM tabular.actions'
    );
    assert.equal(actionCount.count, 7);
    assert.equal(service.published.length, 5);
    assert.equal(
      service.published.some((event) => event.actionId === undefined),
      false
    );

    await writeEvidence(
      new URL('./results.json', import.meta.url).pathname,
      {
        proof: 'P-004',
        disposition: 'proved',
        signals: {
          nonOverlappingRowsCommit: true,
          staleSameRowWriteConflicts: true,
          laterWorkBlocksUndo: true,
          permissionRecheckedOnUndo: true,
          undoRedoRoundTrip: true,
          postCommitPublicationOnly: true,
          boundedReconstructionMatches: true
        },
        finalRows,
        publishedEvents: service.published,
        actionCount: actionCount.count
      }
    );
  } finally {
    await closeDatabase(db);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { server } from 'stackpress/http';
import { createDatabase, closeDatabase, one, rows } from '../lib/database.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import {
  CapabilityService,
  setupAuthorizationProof
} from './capability.mjs';

test('P-005 Stackpress surface parity and PostgreSQL RLS intersection', async () => {
  const db = await createDatabase();
  try {
    await setupAuthorizationProof(db);
    const service = new CapabilityService(db);
    const app = server();
    app.on('tabular.table.capability', async ({ req, res }) => {
      const result = await service.execute(req.data.get());
      res.results(result);
    });

    const invoke = async (surface, input) => {
      const response = await app.resolve('tabular.table.capability', {
        ...input,
        surface
      });
      return response.results;
    };

    const pageRead = await invoke('page', {
      actor: 'alice',
      operation: 'read'
    });
    const apiRead = await invoke('api', {
      actor: 'alice',
      operation: 'read'
    });
    assert.deepEqual(pageRead, apiRead);
    assert.equal(pageRead.rows.length, 1);
    assert.equal(pageRead.rows[0].owner_name, 'tab_alice');
    assert.equal('secret_value' in pageRead.rows[0], false);

    const pageUpdate = await invoke('page', {
      actor: 'alice',
      operation: 'update',
      rowId: 1,
      value: 'Updated from page'
    });
    const apiUpdate = await invoke('api', {
      actor: 'alice',
      operation: 'update',
      rowId: 1,
      value: 'Updated from API'
    });
    assert.equal(pageUpdate.status, 'authorized');
    assert.equal(apiUpdate.status, 'authorized');
    assert.deepEqual(
      Object.keys(pageUpdate).sort(),
      Object.keys(apiUpdate).sort()
    );

    const applicationDenied = await invoke('page', {
      actor: 'charlie',
      operation: 'update',
      rowId: 1,
      value: 'must not commit'
    });
    assert.deepEqual(applicationDenied, {
      status: 'denied',
      source: 'application-policy',
      operation: 'update'
    });

    const databaseDenied = await invoke('api', {
      actor: 'bob',
      operation: 'update',
      rowId: 1,
      value: 'must not cross RLS'
    });
    assert.deepEqual(databaseDenied, {
      status: 'denied',
      source: 'postgresql-policy',
      operation: 'update'
    });

    const bobRead = await invoke('api', {
      actor: 'bob',
      operation: 'read'
    });
    assert.deepEqual(
      bobRead.rows.map((row) => row.id),
      [2]
    );

    const ownerVisible = await db.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE tab_owner');
      return one(
        tx,
        'SELECT count(*)::integer AS count FROM workspace.secured_rows'
      );
    });
    assert.equal(ownerVisible.count, 0);

    const connectionIdentity = await one(
      db,
      'SELECT current_user, session_user'
    );
    assert.equal(connectionIdentity.current_user, connectionIdentity.session_user);

    const stored = await one(
      db,
      'SELECT public_value, secret_value FROM workspace.secured_rows WHERE id = 1'
    );
    assert.equal(stored.public_value, 'Updated from API');
    assert.equal(stored.secret_value, 'alice-secret');

    const audit = await rows(
      db,
      `SELECT actor, surface, operation, outcome, target_id, details
       FROM tabular.audit ORDER BY id`
    );
    assert.equal(audit.length, 7);
    const auditText = JSON.stringify(audit);
    assert.equal(auditText.includes('alice-secret'), false);
    assert.equal(auditText.includes('Updated from API'), false);
    assert.equal(auditText.includes('must not cross RLS'), false);

    await writeEvidence(
      new URL('./results.json', import.meta.url).pathname,
      {
        proof: 'P-005',
        disposition: 'proved',
        stackpressVersion: '0.10.8',
        database: 'PGlite / PostgreSQL 17.5 semantics',
        signals: {
          sharedNamedEvent: 'tabular.table.capability',
          pageApiOutcomeParity: true,
          denyDefaultApplicationPolicy: true,
          forcedRlsFiltersReads: true,
          forcedRlsDeniesCrossOwnerWrites: true,
          forcedRlsAppliesToTableOwner: true,
          roleResetAfterTransaction: true,
          redactedAudit: true
        },
        limitation:
          'Does not prove server PostgreSQL connection-pool role reset, network identity propagation, or PostgreSQL 18 behavior.',
        audit
      }
    );
  } finally {
    await closeDatabase(db);
  }
});

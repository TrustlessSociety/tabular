//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import pg from 'pg';

//client
import type { GridColumn, GridResource } from '../../../../src/plugins/grid/helpers/contracts.js';
import type { BrowserMutationPrincipal } from '../../../../src/plugins/identity/helpers/contracts.js';
import type { SavedViewDefinition } from '../../../../src/plugins/saved-views/helpers/contracts.js';
import { startWeb } from '../../../../src/bootstrap/application.js';
import { ApplicationError } from '../../../../src/bootstrap/errors.js';
import { WebCapabilityAdapter } from '../../../../src/plugins/capability/events/web-adapter.js';
import { ManagedPostgresPool } from '../../../../src/plugins/database/helpers/pool.js';
import { runMigrations } from '../../../../src/plugins/database/helpers/migrator.js';
import { withPostgreSqlTransaction } from '../../../../src/plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../../src/plugins/database/migrations/index.js';
import { TestIdentityProvider } from '../../../plugins/identity/provider-double.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;
const rankMetadataId = `col_${'r'.repeat(32)}`;
const runtimeOutboxLoad = 40;

/**
 * Assert the disposable target.
 */
function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00010-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00010');
  assert.ok(target.port);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
}

/**
 * Return the transaction result.
 */
function transaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: {
        statement_timeout: '10000',
        lock_timeout: '10000',
        idle_in_transaction_session_timeout: '10000'
      }
    }, callback);
}

test('PostgreSQL 18 durable SSE, saved views, and shared row order', {
  timeout: 90_000
}, async () => {
  assertDisposableTarget(connectionString);
  const admin = new Pool({ connectionString, max: 6, allowExitOnIdle: true });
  const migrator = new ManagedPostgresPool({
    name: 'task00010-migrator',
    connectionString,
    maximum: 2,
    applicationName: 'tabular-task00010-migrator'
  });
  let first: Awaited<ReturnType<typeof startWeb>> | undefined;
  let second: Awaited<ReturnType<typeof startWeb>> | undefined;
  let alternate: Awaited<ReturnType<typeof startWeb>> | undefined;
  try {
    const version = await admin.query(`
      SELECT current_setting('server_version_num')::integer AS number
    `);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);
    await reset(admin);
    await admin.query(`
      CREATE ROLE tabular_task10_owner
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task10_reader
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task10_other
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    `);
    assert.deepEqual(await runMigrations(transaction(migrator), await loadMigrations()), {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      total: 11
    });
    await admin.query(`
      CREATE SCHEMA workspace AUTHORIZATION tabular_task10_owner;
      CREATE TABLE workspace.orders (
        id text PRIMARY KEY,
        title text NOT NULL,
        amount integer NOT NULL,
        __tabular_row_v1 text COLLATE "C"
      );
      ALTER TABLE workspace.orders OWNER TO tabular_task10_owner;
      INSERT INTO workspace.orders (id, title, amount)
      VALUES ('a', 'Alpha', 1), ('b', 'Beta', 2), ('c', 'Gamma', 3);
      CREATE TABLE workspace.other_orders (
        id text PRIMARY KEY,
        title text NOT NULL
      );
      ALTER TABLE workspace.other_orders OWNER TO tabular_task10_owner;
      INSERT INTO workspace.other_orders VALUES ('x', 'Other resource');

      GRANT USAGE ON SCHEMA workspace TO tabular_task10_reader, tabular_task10_other;
      GRANT SELECT, INSERT, UPDATE, DELETE ON workspace.orders TO tabular_task10_reader;
      GRANT SELECT ON workspace.other_orders TO tabular_task10_other;

      GRANT USAGE ON SCHEMA tabular
        TO tabular_task10_owner, tabular_task10_reader, tabular_task10_other;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular
        TO tabular_task10_owner, tabular_task10_reader, tabular_task10_other;
    `);

    const environment = {
      NODE_ENV: 'test',
      TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
      TABULAR_DATABASE_CONNECTION_ID: 'task00010',
      TABULAR_WEB_DATABASE_URL: connectionString,
      TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '600',
      TABULAR_SESSION_MAX_AGE_SECONDS: '3600',
      TABULAR_SSE_HEARTBEAT_MS: '20',
      TABULAR_SSE_POLL_MS: '5',
      TABULAR_SSE_REPLAY_LIMIT: '100',
      TABULAR_SSE_CLIENT_QUEUE_LIMIT: '32'
    };
    first = await startWeb({
      env: environment,
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd(),
      host: '127.0.0.1',
      port: 0
    });

    const provider = new TestIdentityProvider();
    const ownerSubject = await provider.verify({
      assertion: 'verified-test-assertion', subject: 'task10-owner-one', displayName: 'Owner one'
    });
    const ownerTwoSubject = await provider.verify({
      assertion: 'verified-test-assertion', subject: 'task10-owner-two', displayName: 'Owner two'
    });
    const readerSubject = await provider.verify({
      assertion: 'verified-test-assertion', subject: 'task10-reader', displayName: 'Reader'
    });
    const otherSubject = await provider.verify({
      assertion: 'verified-test-assertion', subject: 'task10-other', displayName: 'Other'
    });
    const ownerProvision = await first.identity.provisionIdentityRole(ownerSubject, 'tabular_task10_owner');
    await first.identity.provisionIdentityRole(ownerTwoSubject, 'tabular_task10_owner');
    const readerProvision = await first.identity.provisionIdentityRole(readerSubject, 'tabular_task10_reader');
    const otherProvision = await first.identity.provisionIdentityRole(otherSubject, 'tabular_task10_other');
    const ownerSession = await first.identity.establishBrowserSession(ownerSubject);
    const ownerTwoSession = await first.identity.establishBrowserSession(ownerTwoSubject);
    const readerSession = await first.identity.establishBrowserSession(readerSubject);
    const otherSession = await first.identity.establishBrowserSession(otherSubject);
    const owner = await mutation(first, ownerSession.cookieToken, ownerSession.csrfToken);
    const ownerTwo = await mutation(first, ownerTwoSession.cookieToken, ownerTwoSession.csrfToken);
    const reader = await mutation(first, readerSession.cookieToken, readerSession.csrfToken);

    const catalog = await first.catalog.discover(ownerSession.principal);
    const orders = catalog.schemas.flatMap((schema) => schema.files)
      .find((file) => file.name === 'orders')!;
    const otherOrders = catalog.schemas.flatMap((schema) => schema.files)
      .find((file) => file.name === 'other_orders')!;
    const rankColumn = orders.columns.find((column) => column.name === '__tabular_row_v1')!;
    await admin.query(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, display_name,
        field_kind, format_kind, hidden, hidden_purpose
      ) VALUES ($1, $2, $3, 'Shared row order', 'text', 'plain-text', true, 'shared-rank')
    `, [rankMetadataId, orders.id, rankColumn.id]);

    const initial = required(await first.grid.load(ownerSession.principal, orders.id));
    assert.equal(initial.rows.length, 3);
    assert.equal(initial.columns.some((column) => column.label.includes('tabular row')), false);
    assert.equal(initial.rowOrderVersion, 1);
    const idColumn = column(initial, 'id');
    const titleColumn = column(initial, 'title');
    const amountColumn = column(initial, 'amount');
    const viewDefinition = definition(initial, titleColumn.id);
    const otherGrid = required(await first.grid.load(ownerSession.principal, otherOrders.id));
    const foreignDefinition = definition(otherGrid, column(otherGrid, 'title').id);
    await assert.rejects(
      first.savedViews.create(owner, {
        fileId: orders.id,
        name: 'Forged foreign columns',
        access: 'private',
        definition: foreignDefinition
      }, 'cmd_task10_foreign_definition'),
      applicationCode('saved_view_invalid_definition')
    );

    const shared = await first.savedViews.create(owner, {
      fileId: orders.id,
      name: 'Ready orders',
      access: 'shared',
      definition: viewDefinition
    }, 'cmd_task10_shared_create');
    const replay = await first.savedViews.create(owner, {
      fileId: orders.id,
      name: 'Ready orders',
      access: 'shared',
      definition: viewDefinition
    }, 'cmd_task10_shared_create');
    assert.equal(replay.id, shared.id);
    assert.equal('replayed' in replay && replay.replayed, true);
    await assert.rejects(
      first.savedViews.create(owner, {
        fileId: orders.id,
        name: 'Rebound command',
        access: 'shared',
        definition: viewDefinition
      }, 'cmd_task10_shared_create'),
      applicationCode('saved_view_idempotency_conflict')
    );
    const ownerPrivate = await first.savedViews.create(owner, {
      fileId: orders.id, name: 'Owner notes', access: 'private', definition: viewDefinition
    }, 'cmd_task10_owner_private');
    const readerCreateInput = {
      fileId: orders.id, name: 'Reader notes', access: 'private', definition: viewDefinition
    } as const;
    const readerPrivate = await first.savedViews.create(
      reader,
      readerCreateInput,
      'cmd_task10_reader_private'
    );
    await assert.rejects(
      first.savedViews.create(reader, {
        fileId: orders.id, name: 'Forged shared', access: 'shared', definition: viewDefinition
      }, 'cmd_task10_reader_shared'),
      applicationCode('saved_view_denied')
    );
    const readerViews = await first.savedViews.list(readerSession.principal, [orders.id]);
    assert.ok(readerViews.views.some((view) => view.id === shared.id));
    assert.ok(readerViews.views.some((view) => view.id === readerPrivate.id));
    assert.equal(readerViews.views.some((view) => view.id === ownerPrivate.id), false);
    await assert.rejects(
      first.savedViews.get(readerSession.principal, ownerPrivate.id),
      applicationCode('saved_view_unavailable')
    );
    const readerDuplicateInput = {
      viewId: shared.id, name: 'My ready orders', access: 'private'
    } as const;
    const duplicate = await first.savedViews.duplicate(
      reader,
      readerDuplicateInput,
      'cmd_task10_duplicate_shared'
    );
    assert.equal(duplicate.ownerIdentityId, readerProvision.identityId);
    assert.equal(duplicate.access, 'private');
    const replaySource = await first.savedViews.create(owner, {
      fileId: orders.id, name: 'Replay source', access: 'private', definition: viewDefinition
    }, 'cmd_task10_duplicate_replay_source');
    const firstDuplicate = await first.savedViews.duplicate(owner, {
      viewId: replaySource.id, name: 'Replay copy', access: 'private'
    }, 'cmd_task10_duplicate_replay');
    await first.savedViews.delete(owner, {
      viewId: replaySource.id, expectedVersion: replaySource.version
    }, 'cmd_task10_duplicate_replay_source_delete');
    const replayedDuplicate = await first.savedViews.duplicate(owner, {
      viewId: replaySource.id, name: 'Replay copy', access: 'private'
    }, 'cmd_task10_duplicate_replay');
    assert.equal(replayedDuplicate.id, firstDuplicate.id);
    assert.equal(replayedDuplicate.replayed, true);
    const readerUpdateInput = {
      viewId: readerPrivate.id,
      expectedVersion: readerPrivate.version,
      name: 'Reader notes updated',
      access: 'private',
      definition: viewDefinition
    } as const;
    const updatedReaderPrivate = await first.savedViews.update(
      reader,
      readerUpdateInput,
      'cmd_task10_reader_update_replay'
    );
    const readerDeleteSource = await first.savedViews.create(reader, {
      fileId: orders.id,
      name: 'Reader delete replay',
      access: 'private',
      definition: viewDefinition
    }, 'cmd_task10_reader_delete_source');
    const readerDeleteInput = {
      viewId: readerDeleteSource.id,
      expectedVersion: readerDeleteSource.version
    };
    await first.savedViews.delete(
      reader,
      readerDeleteInput,
      'cmd_task10_reader_delete_replay'
    );
    const updatedShared = await first.savedViews.update(ownerTwo, {
      viewId: shared.id,
      expectedVersion: shared.version,
      name: 'Ready orders now',
      access: 'shared',
      definition: { ...viewDefinition, filters: [] }
    }, 'cmd_task10_shared_update');
    assert.equal(updatedShared.version, 2);
    await assert.rejects(
      first.savedViews.update(ownerTwo, {
        viewId: shared.id,
        expectedVersion: 1,
        name: 'Stale update',
        access: 'shared',
        definition: viewDefinition
      }, 'cmd_task10_stale_update'),
      applicationCode('saved_view_conflict')
    );
    const explorer = await first.explorer.discover(readerSession.principal);
    const discovered = explorer.folders.flatMap((folder) => folder.views);
    assert.ok(discovered.some((view) => view.id === updatedShared.id && view.access === 'Shared'));
    assert.ok(discovered.some((view) => view.id === readerPrivate.id && view.access === 'Personal'));

    const capability = new WebCapabilityAdapter(first.identity, first.capability);
    const secretTitle = 'DO_NOT_LEAK_TASK10_VALUE';
    const inserted = await capability.invoke(owner, { action: {
      type: 'record.insert',
      commandId: 'cmd_task10_ranked_insert',
      fileId: orders.id,
      patch: [
        { columnId: idColumn.id, value: { type: 'text', value: 'd' } },
        { columnId: titleColumn.id, value: { type: 'text', value: secretTitle } },
        { columnId: amountColumn.id, value: { type: 'integer', value: '4' } }
      ]
    }});
    assert.equal(inserted.status, 'ok');
    const afterInsert = required(await first.grid.load(ownerSession.principal, orders.id));
    assert.equal(afterInsert.rows.length, 4);
    assert.equal(afterInsert.rowOrderVersion, 2);
    const ranksAfterInsert = await admin.query(`
      SELECT id, __tabular_row_v1 AS rank
        FROM workspace.orders
       ORDER BY __tabular_row_v1 COLLATE "C" NULLS LAST, id
    `);
    assert.deepEqual(ranksAfterInsert.rows.map((row) => row.rank), [
      '000000000000000001000000',
      '000000000000000002000000',
      '000000000000000003000000',
      '000000000000000004000000'
    ]);
    const payloads = await admin.query(`
      SELECT payload::text AS payload FROM tabular.outbox_events ORDER BY sequence
    `);
    assert.equal(payloads.rows.some((row) => row.payload.includes(secretTitle)), false);

    await admin.query('UPDATE workspace.orders SET __tabular_row_v1 = NULL');
    const beforeMove = required(await first.grid.load(ownerSession.principal, orders.id));
    const rowA = beforeMove.rows.find((row) => row[idColumn.id] === 'a')!;
    const rowB = beforeMove.rows.find((row) => row[idColumn.id] === 'b')!;
    const rowC = beforeMove.rows.find((row) => row[idColumn.id] === 'c')!;
    const moved = await first.savedViews.moveRow(owner, {
      fileId: orders.id,
      rowId: rowC.id,
      beforeRowId: rowA.id,
      afterRowId: rowB.id,
      expectedVersion: beforeMove.rowOrderVersion!
    }, 'cmd_task10_move_rebalance');
    assert.equal(moved.rebalanced, true);
    assert.equal(moved.version, beforeMove.rowOrderVersion! + 1);
    assert.deepEqual((await admin.query(`
      SELECT id FROM workspace.orders
       ORDER BY __tabular_row_v1 COLLATE "C" NULLS LAST, id
    `)).rows.map((row) => row.id), ['a', 'c', 'b', 'd']);
    const stable = required(await first.grid.load(ownerSession.principal, orders.id));
    assert.deepEqual(stable.rows.map((row) => row[idColumn.id]), ['a', 'c', 'b', 'd']);

    const exactMove = await first.savedViews.moveRow(owner, {
      fileId: orders.id,
      rowId: stable.rows[0]!.id,
      beforeRowId: stable.rows[1]!.id,
      afterRowId: stable.rows[2]!.id,
      expectedVersion: stable.rowOrderVersion!
    }, 'cmd_task10_move_exact_ranks');
    assert.equal(exactMove.rebalanced, false);
    const exactRanks = await admin.query(`
      SELECT id, __tabular_row_v1 AS rank
        FROM workspace.orders
       ORDER BY __tabular_row_v1 COLLATE "C" NULLS LAST, id
    `);
    assert.deepEqual(exactRanks.rows.map((row) => row.id), ['c', 'a', 'b', 'd']);
    assert.equal(exactRanks.rows.every((row) => /^[0-9]{18}000000$/.test(row.rank)), true);

    const afterExactMove = required(await first.grid.load(ownerSession.principal, orders.id));

    const concurrentVersion = afterExactMove.rowOrderVersion!;
    const rowD = afterExactMove.rows.find((row) => row[idColumn.id] === 'd')!;
    const concurrentMoves = await Promise.allSettled([
      first.savedViews.moveRow(owner, {
        fileId: orders.id, rowId: rowD.id, afterRowId: rowA.id,
        expectedVersion: concurrentVersion
      }, 'cmd_task10_move_concurrent_a'),
      first.savedViews.moveRow(ownerTwo, {
        fileId: orders.id, rowId: rowB.id, afterRowId: rowA.id,
        expectedVersion: concurrentVersion
      }, 'cmd_task10_move_concurrent_b')
    ]);
    assert.equal(concurrentMoves.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = concurrentMoves.find((result) => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && applicationCode('saved_view_conflict')(rejected.reason));
    const uniqueRanks = await admin.query(`
      SELECT count(*)::integer AS total,
             count(DISTINCT __tabular_row_v1)::integer AS distinct_total,
             bool_and(__tabular_row_v1 ~ '^[0-9]{24}$') AS valid
        FROM workspace.orders
    `);
    assert.deepEqual(uniqueRanks.rows[0], { total: 4, distinct_total: 4, valid: true });

    const readerReplayGrid = required(await first.grid.load(readerSession.principal, orders.id));
    const readerMoveInput = {
      fileId: orders.id,
      rowId: readerReplayGrid.rows.at(-1)!.id,
      afterRowId: readerReplayGrid.rows[0]!.id,
      expectedVersion: readerReplayGrid.rowOrderVersion!
    };
    await first.savedViews.moveRow(
      reader,
      readerMoveInput,
      'cmd_task10_reader_move_replay'
    );
    await admin.query('REVOKE UPDATE ON workspace.orders FROM tabular_task10_reader');
    await assert.rejects(
      first.savedViews.moveRow(reader, readerMoveInput, 'cmd_task10_reader_move_replay'),
      applicationCode('saved_view_denied')
    );
    await admin.query('GRANT UPDATE ON workspace.orders TO tabular_task10_reader');

    const insertMoveGrid = required(await first.grid.load(ownerSession.principal, orders.id));
    const movingRow = insertMoveGrid.rows.at(-1)!;
    const neighbourRow = insertMoveGrid.rows[0]!;
    const insertMoveAttempts = await Promise.allSettled([
      capability.invoke(owner, { action: {
        type: 'record.insert',
        commandId: 'cmd_task10_insert_move_concurrent_insert',
        fileId: orders.id,
        patch: [
          { columnId: idColumn.id, value: { type: 'text', value: 'e' } },
          { columnId: titleColumn.id, value: { type: 'text', value: 'Concurrent insert' } },
          { columnId: amountColumn.id, value: { type: 'integer', value: '5' } }
        ]
      }}),
      first.savedViews.moveRow(ownerTwo, {
        fileId: orders.id,
        rowId: movingRow.id,
        afterRowId: neighbourRow.id,
        expectedVersion: insertMoveGrid.rowOrderVersion!
      }, 'cmd_task10_insert_move_concurrent_move')
    ]);
    assert.equal(insertMoveAttempts[0]!.status, 'fulfilled');
    if (insertMoveAttempts[0]!.status === 'fulfilled') {
      assert.equal(insertMoveAttempts[0]!.value.status, 'ok');
    }
    if (insertMoveAttempts[1]!.status === 'rejected') {
      assert.ok(
        applicationCode('saved_view_conflict')(insertMoveAttempts[1]!.reason),
        insertMoveAttempts[1]!.reason instanceof Error
          ? insertMoveAttempts[1]!.reason.stack
          : String(insertMoveAttempts[1]!.reason)
      );
    }
    const ranksAfterInsertMove = await admin.query(`
      SELECT count(*)::integer AS total,
             count(DISTINCT __tabular_row_v1)::integer AS distinct_total,
             bool_and(__tabular_row_v1 ~ '^[0-9]{24}$') AS valid
        FROM workspace.orders
    `);
    assert.deepEqual(
      ranksAfterInsertMove.rows[0],
      { total: 5, distinct_total: 5, valid: true }
    );

    const beforeRollback = Number((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.outbox_events
    `)).rows[0].count);
    await assert.rejects(first.identity.authorizedTransaction(
      ownerSession.principal,
      'tabular.saved-views',
      async (database) => {
        await database.execute(`
          INSERT INTO tabular.outbox_events (
            sequence, id, connection_id, file_id, actor_identity_id,
            event_type, idempotency_key, payload
          ) VALUES (
            tabular.allocate_change_cursor(?), ?, ?, ?, ?,
            'saved-view.changed', 'task10:rolled-back', '{}'::jsonb
          )
        `, [
          ownerSession.principal.connectionId,
          `evt_${'z'.repeat(32)}`,
          ownerSession.principal.connectionId,
          orders.id,
          ownerSession.principal.identityId
        ]);
        throw new Error('force rollback');
      }
    ), /force rollback/);
    assert.equal(Number((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.outbox_events
    `)).rows[0].count), beforeRollback);

    second = await startWeb({
      env: environment,
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd(),
      host: '127.0.0.1',
      port: 0
    });
    const cursor = (await first.savedViews.list(ownerSession.principal, [orders.id])).cursor;
    const finalShared = await first.savedViews.update(owner, {
      viewId: updatedShared.id,
      expectedVersion: updatedShared.version,
      name: 'Ready orders live',
      access: 'shared',
      definition: viewDefinition
    }, 'cmd_task10_cross_instance');
    const firstBatch = await first.realtime.readBatch(ownerSession.principal, orders.id, cursor);
    const secondBatch = await second.realtime.readBatch(ownerSession.principal, orders.id, cursor);
    assert.deepEqual(secondBatch, firstBatch);
    assert.ok(firstBatch.events.some((event) =>
      event.type === 'saved-view.changed' && event.payload.viewId === finalShared.id
    ));
    assert.deepEqual(firstBatch.events.map((event) => event.cursor),
      [...firstBatch.events.map((event) => event.cursor)].sort((left, right) => left - right));

    const sseCursor = firstBatch.highWater;
    const streamedShared = await first.savedViews.update(owner, {
      viewId: finalShared.id,
      expectedVersion: finalShared.version,
      name: 'Ready orders streamed',
      access: 'shared',
      definition: viewDefinition
    }, 'cmd_task10_sse_resume');
    const sse = await readSseChange(
      `${second.origin}/events?fileId=${orders.id}&cursor=0`,
      `${second.runtime.config.sessions.cookieName}=${ownerSession.cookieToken}`,
      sseCursor
    );
    assert.equal(sse.status, 200);
    assert.match(sse.contentType, /^text\/event-stream/);
    assert.match(sse.cacheControl, /no-cache/);
    const resumedId = Number(sse.text.match(/id: ([0-9]+)/)?.[1]);
    assert.ok(Number.isSafeInteger(resumedId) && resumedId > sseCursor);
    assert.match(sse.text, /event: tabular\.change/);

    await admin.query(`
      INSERT INTO tabular.outbox_events (
        sequence, id, connection_id, file_id, actor_identity_id,
        event_type, idempotency_key, payload
      )
      SELECT tabular.allocate_change_cursor('task00010'),
             'evt_' || md5('task10-runtime-load-' || ordinal::text),
             'task00010', $1, $2, 'saved-view.changed',
             'task10:runtime-load:' || ordinal::text,
             jsonb_build_object('viewId', $3::text, 'action', 'updated')
        FROM generate_series(1, $4::integer) AS ordinal
    `, [orders.id, ownerSession.principal.identityId, finalShared.id, runtimeOutboxLoad]);
    const loadCount = Number((await admin.query(`
      SELECT count(*)::integer AS count
        FROM tabular.outbox_events
       WHERE connection_id = 'task00010'
         AND idempotency_key LIKE 'task10:runtime-load:%'
    `)).rows[0].count);
    assert.equal(loadCount, runtimeOutboxLoad);
    const slowConsumer = await readSseEvent(
      `${second.origin}/events?fileId=${orders.id}`,
      `${second.runtime.config.sessions.cookieName}=${ownerSession.cookieToken}`,
      resumedId,
      'snapshot.required'
    );
    const slowRecord = sseRecord<{ reason: string, }>(
      slowConsumer.text,
      'snapshot.required',
      true
    );
    assert.equal(slowRecord.data.reason, 'client-backpressure');
    assert.equal(slowRecord.id, resumedId + runtimeOutboxLoad);

    const reconnectedShared = await first.savedViews.update(owner, {
      viewId: streamedShared.id,
      expectedVersion: streamedShared.version,
      name: 'Ready orders reconnected',
      access: 'shared',
      definition: viewDefinition
    }, 'cmd_task10_sse_cross_instance_reconnect');
    const reconnected = await readSseChange(
      `${first.origin}/events?fileId=${orders.id}`,
      `${first.runtime.config.sessions.cookieName}=${ownerSession.cookieToken}`,
      slowRecord.id
    );
    const reconnectRecord = sseRecord<{ payload: { viewId: string, }, }>(
      reconnected.text,
      'tabular.change',
      true
    );
    assert.ok(reconnectRecord.id > slowRecord.id);
    assert.equal(reconnectRecord.data.payload.viewId, reconnectedShared.id);

    alternate = await startWeb({
      env: { ...environment, TABULAR_DATABASE_CONNECTION_ID: 'task00010b' },
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd(),
      host: '127.0.0.1',
      port: 0
    });
    await alternate.identity.provisionIdentityRole(ownerSubject, 'tabular_task10_owner');
    const alternateSession = await alternate.identity.establishBrowserSession(ownerSubject);
    const alternateOwner = await mutation(
      alternate,
      alternateSession.cookieToken,
      alternateSession.csrfToken
    );
    const alternateCatalog = await alternate.catalog.discover(alternateSession.principal);
    const alternateOrders = alternateCatalog.schemas.flatMap((schema) => schema.files)
      .find((file) => file.name === 'orders')!;
    const alternateRankColumn = alternateOrders.columns
      .find((column) => column.name === '__tabular_row_v1')!;
    await admin.query(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, display_name,
        field_kind, format_kind, hidden, hidden_purpose
      ) VALUES ($1, $2, $3, 'Shared row order', 'text', 'plain-text', true, 'shared-rank')
    `, [`col_${'q'.repeat(32)}`, alternateOrders.id, alternateRankColumn.id]);
    const alternateGrid = required(await alternate.grid.load(
      alternateSession.principal,
      alternateOrders.id
    ));
    const crossConnectionCommand = 'cmd_task10_connection_collision';
    await first.savedViews.create(owner, {
      fileId: orders.id,
      name: 'First connection scope',
      access: 'shared',
      definition: viewDefinition
    }, crossConnectionCommand);
    await alternate.savedViews.create(alternateOwner, {
      fileId: alternateOrders.id,
      name: 'Second connection scope',
      access: 'shared',
      definition: definition(alternateGrid, column(alternateGrid, 'title').id)
    }, crossConnectionCommand);
    const scopedEvents = await admin.query(`
      SELECT connection_id, count(*)::integer AS total
        FROM tabular.outbox_events
       WHERE event_type = 'saved-view.changed'
         AND idempotency_key LIKE '%:' || $1
       GROUP BY connection_id
       ORDER BY connection_id
    `, [crossConnectionCommand]);
    assert.deepEqual(scopedEvents.rows, [
      { connection_id: 'task00010', total: 1 },
      { connection_id: 'task00010b', total: 1 }
    ]);
    await alternate.close();
    alternate = undefined;

    const otherCatalog = await first.catalog.discover(ownerSession.principal);
    assert.ok(otherCatalog.schemas.flatMap((schema) => schema.files)
      .some((file) => file.id === otherOrders.id));
    const beforeOther = (await first.savedViews.list(ownerSession.principal, [orders.id])).cursor;
    await first.savedViews.create(owner, {
      fileId: otherOrders.id,
      name: 'Other shared',
      access: 'shared',
      definition: definition(otherGrid, column(otherGrid, 'title').id)
    }, 'cmd_task10_other_resource');
    const isolated = await first.realtime.readBatch(ownerSession.principal, orders.id, beforeOther);
    assert.deepEqual(isolated.events, []);
    assert.ok(isolated.scannedThrough > beforeOther);

    const beforePrivate = isolated.scannedThrough;
    await first.savedViews.create(owner, {
      fileId: orders.id,
      name: 'Owner stream private',
      access: 'private',
      definition: viewDefinition
    }, 'cmd_task10_private_stream');
    const ownerTwoPrivate = await first.realtime.readBatch(
      ownerTwoSession.principal,
      orders.id,
      beforePrivate
    );
    assert.deepEqual(ownerTwoPrivate.events, []);
    assert.ok(ownerTwoPrivate.scannedThrough > beforePrivate);

    await admin.query('REVOKE SELECT ON workspace.orders FROM tabular_task10_reader');
    const accessRevoked = await readSseEvent(
      `${second.origin}/events?fileId=${orders.id}`,
      `${second.runtime.config.sessions.cookieName}=${readerSession.cookieToken}`,
      0,
      'access.revoked'
    );
    assert.equal(
      sseRecord<{ code: string, }>(accessRevoked.text, 'access.revoked').data.code,
      'realtime_access_lost'
    );
    await assert.rejects(
      first.savedViews.create(reader, readerCreateInput, 'cmd_task10_reader_private'),
      applicationCode('saved_view_denied')
    );
    await assert.rejects(
      first.savedViews.update(reader, readerUpdateInput, 'cmd_task10_reader_update_replay'),
      applicationCode('saved_view_denied')
    );
    await assert.rejects(
      first.savedViews.duplicate(reader, readerDuplicateInput, 'cmd_task10_duplicate_shared'),
      applicationCode('saved_view_denied')
    );
    await assert.rejects(
      first.savedViews.delete(reader, readerDeleteInput, 'cmd_task10_reader_delete_replay'),
      applicationCode('saved_view_denied')
    );
    await assert.rejects(
      first.realtime.readBatch(readerSession.principal, orders.id, 0),
      applicationCode('realtime_access_lost')
    );
    await admin.query('GRANT SELECT ON workspace.orders TO tabular_task10_reader');
    await first.identity.setIdentityStatus(otherProvision.identityId, 'disabled');
    await assert.rejects(
      first.realtime.readBatch(otherSession.principal, otherOrders.id, 0),
      applicationCode('invalid_session')
    );

    const highWater = Number((await admin.query(`
      SELECT next_cursor - 1 AS cursor
        FROM tabular.change_streams WHERE connection_id = 'task00010'
    `)).rows[0].cursor);
    await admin.query(`
      UPDATE tabular.change_streams
         SET retained_from_cursor = $1
       WHERE connection_id = 'task00010'
    `, [highWater]);
    const gap = await first.realtime.readBatch(ownerSession.principal, orders.id, 0);
    assert.equal(gap.gap, true);
    assert.deepEqual(gap.events, []);
    const gapStream = await readSseEvent(
      `${second.origin}/events?fileId=${orders.id}&cursor=0`,
      `${second.runtime.config.sessions.cookieName}=${ownerSession.cookieToken}`,
      undefined,
      'snapshot.required'
    );
    const gapRecord = sseRecord<{ reason: string, }>(
      gapStream.text,
      'snapshot.required',
      true
    );
    assert.equal(gapRecord.id, highWater);
    assert.equal(gapRecord.data.reason, 'cursor-gap');

    assert.equal(ownerProvision.identityId, ownerSession.principal.identityId);
    assert.equal(readerProvision.identityId, readerSession.principal.identityId);
    await first.savedViews.delete(reader, {
      viewId: readerPrivate.id,
      expectedVersion: updatedReaderPrivate.version
    }, 'cmd_task10_reader_delete');
  } finally {
    await alternate?.close().catch(() => undefined);
    await second?.close().catch(() => undefined);
    await first?.close().catch(() => undefined);
    await migrator.close().catch(() => undefined);
    await reset(admin).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});

/**
 * Return the mutation result.
 */
async function mutation(
  application: Awaited<ReturnType<typeof startWeb>>,
  cookieToken: string,
  csrfToken: string
): Promise<BrowserMutationPrincipal> {
  return application.identity.requireBrowserMutation({
    cookieToken,
    csrfToken,
    origin: 'https://tabular.test'
  });
}

/**
 * Return the column result.
 */
function column(grid: GridResource, physicalName: string): GridColumn {
  return required(grid.columns.find((candidate) => candidate.label === physicalName));
}

/**
 * Return the definition result.
 */
function definition(grid: GridResource, formattedColumnId: string): SavedViewDefinition {
  const firstRow = required(grid.rows[0]);
  return {
    schemaVersion: 1,
    columnOrder: grid.columns.map((column) => column.id),
    hiddenColumnIds: [],
    sorts: [{ columnId: formattedColumnId, direction: 'asc' }],
    filters: [{ columnId: formattedColumnId, operation: 'like', value: '%' }],
    presentation: {
      [JSON.stringify([firstRow.id, formattedColumnId])]: { bold: true, fillColor: '#fff4cc' }
    },
    includes: {
      filtersAndSorting: true,
      columnLayout: true,
      cellPresentation: true
    }
  };
}

/**
 * Return the application code result.
 */
function applicationCode(code: string) {
  return (error: unknown) => error instanceof ApplicationError && error.errorCode === code;
}

/**
 * Return the required result.
 */
function required<T>(value: T | undefined | null): T {
  assert.ok(value);
  return value;
}

/**
 * Read the SSE change.
 */
async function readSseChange(url: string, cookie: string, lastEventId: number) {
  return readSseEvent(url, cookie, lastEventId, 'tabular.change');
}

/**
 * Read the SSE event.
 */
async function readSseEvent(
  url: string,
  cookie: string,
  lastEventId: number | undefined,
  event: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(url, {
      headers: {
        cookie,
        ...(lastEventId === undefined ? {} : { 'last-event-id': String(lastEventId) })
      },
      signal: controller.signal
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes(`event: ${event}`)) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
    controller.abort();
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      cacheControl: response.headers.get('cache-control') || '',
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Return the SSE record result.
 */
function sseRecord<Data>(text: string, event: string, requireId: true): { id: number, data: Data, };
/**
 * Return the SSE record result.
 */
function sseRecord<Data>(
  text: string,
  event: string,
  requireId?: false
): { id: number | undefined, data: Data, };
/**
 * Return the SSE record result.
 */
function sseRecord<Data>(text: string, event: string, requireId = false) {
  const block = text.split('\n\n').find((candidate) =>
    candidate.split('\n').includes(`event: ${event}`));
  assert.ok(block, `SSE response did not contain ${event}`);
  const idText = block.match(/^id: ([0-9]+)$/m)?.[1];
  const id = idText === undefined ? undefined : Number(idText);
  assert.ok(id === undefined || Number.isSafeInteger(id));
  if (requireId) assert.ok(id !== undefined, `${event} did not contain an SSE event ID`);
  const data = block.match(/^data: (.+)$/m)?.[1];
  assert.ok(data);
  return { id, data: JSON.parse(data) as Data };
}

/**
 * Reset the current value.
 */
async function reset(admin: pg.Pool) {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS workspace CASCADE');
  for (const role of ['tabular_task10_owner', 'tabular_task10_reader', 'tabular_task10_other']) {
    await admin.query(`DROP OWNED BY ${role}`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
}

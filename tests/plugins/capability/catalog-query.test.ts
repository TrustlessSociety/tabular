//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import type { QueryObject } from '@stackpress/inquire/types';

//client
import type { PreparedTarget } from '../../../src/plugins/capability/helpers/contracts.js';
import { ActionFault } from '../../../src/plugins/capability/helpers/contracts.js';
import { CatalogPostgreSqlTargetAdapter } from '../../../src/plugins/capability/helpers/catalog-postgresql-target.js';
import { DatabaseExecutor } from '../../../src/plugins/database/helpers/executor.js';

test('current-grid reads use the shared compiler without changing browse results', async () => {
  //Exercise the default grid path so its projection and stable key order must
  // pass through the same catalog read boundary used by export queries.
  const harness = queryHarness();
  const adapter = new AuthorizedQueryTestAdapter();
  const target = queryTarget();

  const result = await adapter.browse(harness.database, target, 2);

  //Preserve the browse result shape while proving the compiler selects only
  // authorized columns and retains the established current-grid key order.
  const request = dataRequest(harness.requests);
  assert.match(
    request.query,
    /SELECT[\s\S]*xmin::text AS "__tabular_internal_version_0__"[\s\S]*"id"[\s\S]*"label"/
  );
  assert.doesNotMatch(request.query, /WHERE/);
  assert.match(request.query, /ORDER BY "id"\s+LIMIT 2/);
  assert.deepEqual(request.values, []);
  assert.equal('truncated' in result, false);
  assert.deepEqual(result.columns.map((column) => column.columnId), ['col_key', 'col_label']);
  assert.equal(result.rows.length, 2);
});

test('export-shaped queries use the shared compiler for projection, filters, and ordering', async () => {
  //Model the saved-view/current-view export input at the capability boundary:
  // one projected column, one escaped filter, and one explicit descending sort.
  const harness = queryHarness();
  const adapter = new AuthorizedQueryTestAdapter();
  const target = queryTarget();

  const result = await adapter.query(harness.database, target, {
    columnIds: ['col_label'],
    sorts: [{ columnId: 'col_label', direction: 'desc' }],
    filters: [{ columnId: 'col_label', operation: 'like', value: 'ph_' }],
    limit: 2
  });

  //The hidden key remains projected for opaque row identity, while the public
  // result still returns only the requested export column and sentinel limit.
  const request = dataRequest(harness.requests);
  assert.match(request.query, /SELECT[\s\S]*"id"[\s\S]*"label"/);
  assert.match(request.query, /WHERE "label"::text LIKE \? ESCAPE/);
  assert.match(
    request.query,
    /ORDER BY "label" COLLATE "C" DESC NULLS LAST, "id" COLLATE "C" ASC NULLS LAST/
  );
  assert.match(request.query, /LIMIT 3/);
  assert.deepEqual(request.values, ['%ph\\_%']);
  assert.equal(result.truncated, true);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.columns.map((column) => column.columnId), ['col_label']);
  assert.deepEqual(result.rows[0]!.cells, [{
    columnId: 'col_label',
    value: { type: 'text', value: 'Alpha' }
  }]);
});

test('authorized sorting does not apply text collation to UUID-compatible key codecs', async () => {
  const harness = queryHarness();
  const adapter = new AuthorizedQueryTestAdapter();

  await adapter.query(harness.database, queryTarget(false), {
    columnIds: ['col_label'],
    sorts: [{ columnId: 'col_label', direction: 'asc' }],
    filters: [],
    limit: 2
  });

  assert.match(
    dataRequest(harness.requests).query,
    /ORDER BY "label" COLLATE "C" ASC NULLS LAST, "id" ASC NULLS LAST/
  );
});

test('shared query validation rejects forged projections, sorts, and filters before reading rows', async () => {
  const harness = queryHarness();
  const adapter = new AuthorizedQueryTestAdapter();
  const target = queryTarget();

  //A projection outside the role-derived column map fails closed.
  await assert.rejects(() => adapter.query(harness.database, target, {
    columnIds: ['col_forged'],
    sorts: [],
    filters: [],
    limit: 2
  }), (error: unknown) => actionFault(error, 'not_found'));

  //Duplicate sort columns are not permitted to create ambiguous ordering.
  await assert.rejects(() => adapter.query(harness.database, target, {
    columnIds: ['col_label'],
    sorts: [
      { columnId: 'col_label', direction: 'asc' },
      { columnId: 'col_label', direction: 'desc' }
    ],
    filters: [],
    limit: 2
  }), (error: unknown) => actionFault(error, 'validation_failed'));

  //Null comparisons are limited to equality semantics before SQL assembly.
  await assert.rejects(() => adapter.query(harness.database, target, {
    columnIds: ['col_label'],
    sorts: [],
    filters: [{ columnId: 'col_label', operation: '<', value: null }],
    limit: 2
  }), (error: unknown) => actionFault(error, 'validation_failed'));

  assert.equal(dataRequests(harness.requests).length, 0);
});

/**
 * Provides deterministic privileges, rows, and captured SQL for read tests.
 */
function queryHarness() {
  const requests: QueryObject[] = [];
  const sourceRows = [
    { id: 'one', label: 'Alpha', __tabular_internal_version_0__: '1' },
    { id: 'two', label: 'Beta', __tabular_internal_version_0__: '2' },
    { id: 'three', label: 'Gamma', __tabular_internal_version_0__: '3' }
  ];
  const database = new DatabaseExecutor({
    /**
     * Handle the raw operation.
     */
    async raw<Row>(request: QueryObject) {
      requests.push({ query: request.query, values: [...(request.values || [])] });
      let rows: unknown[];
      if (request.query.includes('has_column_privilege')) {
        rows = [
          { attribute_number: 1, can_select: true, can_update: false, can_insert: false },
          { attribute_number: 2, can_select: true, can_update: true, can_insert: true }
        ];
      } else if (request.query.includes('has_table_privilege')) {
        rows = [{ allowed: true }];
      } else {
        const limit = Number(request.query.match(/LIMIT (\d+)/)?.[1] || sourceRows.length);
        rows = sourceRows.slice(0, limit);
      }
      return { rows: rows as Row[], rowCount: rows.length };
    }
  });
  return { database, requests };
}

/**
 * Returns every captured target-table read, excluding privilege probes.
 */
function dataRequests(requests: QueryObject[]) {
  return requests.filter((request) => request.query.includes('FROM ONLY "workspace"."records"'));
}

/**
 * Returns the one compiled target-table read expected by a successful scenario.
 */
function dataRequest(requests: QueryObject[]) {
  const matches = dataRequests(requests);
  assert.equal(matches.length, 1);
  return matches[0]!;
}

/**
 * Narrows and checks the safe capability failure exposed by invalid query input.
 */
function actionFault(error: unknown, code: string) {
  assert.ok(error instanceof ActionFault);
  assert.equal(error.safe.code, code);
  return true;
}

class AuthorizedQueryTestAdapter extends CatalogPostgreSqlTargetAdapter {
  /**
   * Skips catalog drift probes so each unit test isolates read compilation.
   */
  public async authorize() {}
}

/**
 * Builds the smallest catalog target that exercises authorized query output.
 */
function queryTarget(keyCollatable = true): PreparedTarget {
  const key = {
    columnId: 'col_key',
    columnName: 'id',
    attributeNumber: 1,
    codec: 'text' as const,
    collatable: keyCollatable,
    key: true,
    editable: false,
    generated: false
  };
  const label = {
    columnId: 'col_label',
    columnName: 'label',
    attributeNumber: 2,
    codec: 'text' as const,
    collatable: true,
    key: false,
    editable: true,
    generated: false
  };
  return {
    fileId: 'obj_query',
    schemaVersion: 'schema_v1',
    state: {
      definition: {
        relationOid: '42',
        schemaName: 'workspace',
        tableName: 'records',
        qualifiedName: '"workspace"."records"',
        tableReference: 'ONLY "workspace"."records"',
        keyColumns: [key],
        columns: [key, label],
        storedColumns: [key, label],
        versionColumnAlias: '__tabular_internal_version_0__',
        columnsById: new Map([[key.columnId, key], [label.columnId, label]]),
        preparedLiveColumns: []
      }
    }
  };
}

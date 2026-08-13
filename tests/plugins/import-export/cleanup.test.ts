//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import type { QueryObject } from '@stackpress/inquire/types';

//client
import { DatabaseExecutor } from '../../../src/plugins/database/helpers/executor.js';
import { ImportExportRepository } from '../../../src/plugins/import-export/helpers/repository.js';

test('expired staging cleanup is bounded, terminal, lock-safe and payload-purging', async () => {
  const requests: Array<{ query: string, values: unknown[], }> = [];
  const database = new DatabaseExecutor({
    raw: async <Row>(request: QueryObject) => {
      requests.push({ query: request.query, values: [...(request.values || [])] });
      return {
        rows: [
          { id: 'imp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
          { id: 'imp_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' }
        ] as Row[],
        rowCount: 2
      };
    }
  });

  const result = await new ImportExportRepository(database).cleanupExpiredStaging(25);

  assert.deepEqual(result, {
    cleaned: 2,
    importIds: [
      'imp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'imp_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    ]
  });
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0]!.values, [25]);
  assert.match(requests[0]!.query, /FOR UPDATE OF operation SKIP LOCKED/);
  assert.match(requests[0]!.query, /LIMIT \?/);
  assert.match(requests[0]!.query, /SET state = 'cancelled'/);
  assert.match(requests[0]!.query, /preview = '\[\]'::jsonb/);
  assert.match(requests[0]!.query, /DELETE FROM tabular\.import_row_issues/);
  assert.match(requests[0]!.query, /DELETE FROM tabular\.import_rows/);
  assert.match(requests[0]!.query, /DELETE FROM tabular\.import_source_chunks/);
  assert.doesNotMatch(requests[0]!.query, /'committing'/);
});

test('expired staging cleanup rejects unbounded batches before querying', async () => {
  let queried = false;
  const database = new DatabaseExecutor({
    raw: async <Row>() => {
      queried = true;
      return { rows: [] as Row[], rowCount: 0 };
    }
  });
  const repository = new ImportExportRepository(database);

  await assert.rejects(
    () => repository.cleanupExpiredStaging(501),
    /Import staging cleanup limit is invalid/
  );
  assert.equal(queried, false);
});

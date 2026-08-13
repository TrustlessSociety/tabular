//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import type { QueryObject } from '@stackpress/inquire/types';

//client
import type { BrowserPrincipal } from '../../../src/plugins/identity/helpers/contracts.js';
import { DatabaseExecutor } from '../../../src/plugins/database/helpers/executor.js';
import { ImportExportRepository } from '../../../src/plugins/import-export/helpers/repository.js';

const principal: BrowserPrincipal = {
  transport: 'browser',
  sessionId: 'session_test',
  identityId: 'identity_test',
  connectionId: 'primary',
  historyScopeId: 'history_test',
  idleExpiresAt: new Date('2026-08-02T01:00:00.000Z'),
  absoluteExpiresAt: new Date('2026-08-02T02:00:00.000Z')
};

test('nullable Google refresh secrets use explicitly typed PostgreSQL parameters', async () => {
  const queries: string[] = [];
  const database = new DatabaseExecutor({
    raw: async <Row>(request: QueryObject) => {
      queries.push(request.query);
      return { rows: [] as Row[], rowCount: 1 };
    }
  });
  const repository = new ImportExportRepository(database);
  const input = {
    principal,
    access: { ciphertext: 'access', iv: 'iv', tag: 'tag' },
    scope: 'https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    expiresAt: new Date('2026-08-02T01:00:00.000Z')
  };

  await repository.saveGoogleConnection({ id: 'gconn_test', ...input });
  assert.equal(await repository.updateGoogleConnection({ id: 'gconn_test', ...input }), 1);

  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.equal(query.match(/\?::text IS NULL/g)?.length, 3);
    assert.equal(query.match(/decode\(\?::text, 'base64'\)/g)?.length, 3);
    assert.doesNotMatch(query, /CASE WHEN \? IS NULL/);
  }
});

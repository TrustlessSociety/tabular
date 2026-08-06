import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { createDatabase, closeDatabase, one } from '../lib/database.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import {
  fingerprint,
  ImportService,
  normalizeCsv,
  normalizeGoogle,
  normalizeXlsx,
  setupImportProof
} from './importer.mjs';

async function makeWorkbook(target) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Values');
  sheet.getCell('A1').value = 'Label';
  sheet.getCell('B1').value = 'Amount';
  sheet.getCell('A2').value = 'Alpha';
  sheet.getCell('B2').value = 7.25;
  sheet.getCell('C2').value = true;
  sheet.getCell('D2').value = new Date('2026-07-24T00:00:00.000Z');
  sheet.getCell('E2').value = { formula: 'B2*2', result: 14.5 };
  sheet.getCell('F2').value = { formula: '1+1' };
  await workbook.xlsx.writeFile(target);
}

test('P-006 exact-value extraction and transactional import recovery', async () => {
  const fixtureDirectory = new URL('./fixtures/', import.meta.url).pathname;
  await mkdir(fixtureDirectory, { recursive: true });
  const googleRaw = await readFile(
    new URL('./fixtures/google-values.json', import.meta.url)
  );
  const google = normalizeGoogle(JSON.parse(googleRaw.toString('utf8')));
  assert.equal(
    google.cells.find((cell) => cell.coordinate === 'B3').value,
    25
  );
  assert.equal(
    google.cells.find((cell) => cell.coordinate === 'B3').sourceKind,
    'formula-cached-value'
  );
  assert.deepEqual(
    google.warnings.map((warning) => [warning.code, warning.coordinate]),
    [
      ['MISSING_CACHED_VALUE', 'A4'],
      ['SOURCE_ERROR_VALUE', 'B4']
    ]
  );
  assert.equal(JSON.stringify(google.cells).includes('=B2*2'), false);

  const workbookPath = new URL(
    './fixtures/typed-values.xlsx',
    import.meta.url
  ).pathname;
  await makeWorkbook(workbookPath);
  const workbookRaw = await readFile(workbookPath);
  const xlsx = await normalizeXlsx(workbookRaw);
  assert.equal(
    xlsx.cells.find((cell) => cell.coordinate === 'E2').value,
    14.5
  );
  assert.deepEqual(
    xlsx.warnings.map((warning) => warning.coordinate),
    ['F2']
  );
  assert.equal(JSON.stringify(xlsx.cells).includes('B2*2'), false);

  const csvRaw = await readFile(
    new URL('./fixtures/typed-values.csv', import.meta.url)
  );
  const csv = normalizeCsv(
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csvRaw]),
    {
      delimiter: ';',
      types: {
        name: 'string',
        amount: 'number',
        enabled: 'boolean',
        literal_formula: 'string'
      }
    }
  );
  assert.equal(csv.cells.find((cell) => cell.coordinate === 'A2').value, 'Alpha; North');
  assert.equal(csv.cells.find((cell) => cell.coordinate === 'B2').value, 12.5);
  assert.equal(csv.cells.find((cell) => cell.coordinate === 'C2').value, true);
  assert.equal(csv.cells.find((cell) => cell.coordinate === 'D2').value, '=1+2');

  const db = await createDatabase();
  try {
    await setupImportProof(db);
    const service = new ImportService(db);
    const clean = {
      source: 'combined-fixture',
      cells: [
        ...google.cells,
        ...xlsx.cells.filter((cell) => cell.coordinate !== 'F2'),
        ...csv.cells
      ].map((cell, index) => ({
        ...cell,
        sheet: `${cell.sheet}-${index}`
      })),
      warnings: []
    };
    const sourceFingerprint = fingerprint(
      Buffer.concat([googleRaw, workbookRaw, csvRaw])
    );
    const job = await service.start({
      sourceIdentity: 'proof:clean-combined',
      sourceFingerprint,
      options: { valuesOnly: true }
    });
    const duplicate = await service.start({
      sourceIdentity: 'proof:clean-combined',
      sourceFingerprint,
      options: { valuesOnly: true }
    });
    assert.equal(duplicate.id, job.id);

    await service.stage(job.id, clean);
    await service.stage(job.id, clean);
    const stagedCount = await one(
      db,
      `SELECT count(*)::integer AS count
       FROM tabular.staged_cells WHERE job_id = $1`,
      [job.id]
    );
    assert.equal(stagedCount.count, clean.cells.length);

    const changed = await service.commit(job.id, fingerprint('changed source'));
    assert.equal(changed.status, 'source-changed');

    await assert.rejects(
      service.commit(job.id, sourceFingerprint, { failAfter: 1 }),
      /forced commit failure/
    );
    const targetAfterFailure = await one(
      db,
      `SELECT count(*)::integer AS count
       FROM workspace.imported_cells WHERE job_id = $1`,
      [job.id]
    );
    assert.equal(targetAfterFailure.count, 0);

    const committed = await service.commit(job.id, sourceFingerprint);
    assert.equal(committed.status, 'committed');
    const recovered = await service.commit(job.id, sourceFingerprint);
    assert.equal(recovered.status, 'already-committed');
    assert.equal((await service.abandon(job.id)).status, 'cannot-abandon-committed');

    const blockedJob = await service.start({
      sourceIdentity: 'proof:blocked-google',
      sourceFingerprint: fingerprint(googleRaw),
      options: { valuesOnly: true }
    });
    await service.stage(blockedJob.id, google);
    const blocked = await service.commit(
      blockedJob.id,
      fingerprint(googleRaw)
    );
    assert.equal(blocked.status, 'blocked');
    assert.deepEqual(
      blocked.warnings.map((warning) => warning.coordinate),
      ['A4', 'B4']
    );

    const failingJob = await service.start({
      sourceIdentity: 'proof:forced-stage-failure',
      sourceFingerprint: fingerprint('stage-failure'),
      options: { valuesOnly: true }
    });
    await assert.rejects(
      service.stage(failingJob.id, clean, { failAfter: 1 }),
      /forced staging failure/
    );
    const stagedAfterFailure = await one(
      db,
      `SELECT count(*)::integer AS count
       FROM tabular.staged_cells WHERE job_id = $1`,
      [failingJob.id]
    );
    assert.equal(stagedAfterFailure.count, 0);
    await service.stage(failingJob.id, clean);
    assert.equal((await service.abandon(failingJob.id)).status, 'abandoned');
    const stagedAfterAbandon = await one(
      db,
      `SELECT count(*)::integer AS count
       FROM tabular.staged_cells WHERE job_id = $1`,
      [failingJob.id]
    );
    assert.equal(stagedAfterAbandon.count, 0);

    await writeEvidence(
      new URL('./results.json', import.meta.url).pathname,
      {
        proof: 'P-006',
        disposition: 'proved',
        signals: {
          googleEffectiveValuesOnly: true,
          xlsxCachedResultsOnly: true,
          missingCachesBlockWithCoordinates: true,
          csvTokensAndTypesPreserved: true,
          formulasNeverEvaluatedOrPersisted: true,
          duplicateStartAndStageIdempotent: true,
          changedSourceBlocksCommit: true,
          failedCommitRollsBack: true,
          ambiguousCommitRecoversByJobId: true,
          abandonOnlyAffectsStaging: true
        },
        counts: {
          googleCells: google.cells.length,
          xlsxCells: xlsx.cells.length,
          csvCells: csv.cells.length,
          committedCells: committed.inserted
        },
        limitation:
          'Uses API-shaped Google fixtures and generated XLSX/CSV files; it does not exercise live Google authorization, download, or Drive version APIs.'
      }
    );
  } finally {
    await closeDatabase(db);
  }
});

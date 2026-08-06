import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeEvidence(target, evidence) {
  const file = path.resolve(target);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        node: process.version,
        ...evidence
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

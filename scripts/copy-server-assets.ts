import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const source = path.join(projectRoot, 'plugins/database/migrations');
const destination = path.join(projectRoot, 'dist/plugins/database/migrations');
await fs.mkdir(destination, { recursive: true });
const entries = await fs.readdir(source, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
  await fs.copyFile(path.join(source, entry.name), path.join(destination, entry.name));
}
process.stdout.write(`Copied ${entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql')).length} server SQL asset(s).\n`);

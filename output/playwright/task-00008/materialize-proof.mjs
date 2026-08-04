import fs from 'node:fs/promises';

const [templatePath, outputPath] = process.argv.slice(2);
if (!templatePath || !outputPath) throw new Error('template and output paths are required');
const sessionPath = process.env.TABULAR_TASK00008_SESSION_PATH
  || '/tmp/tabular-task00008-sessions.json';
const session = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
const template = await fs.readFile(templatePath, 'utf8');
const materialized = template
  .replaceAll('__TASK00008_ORIGIN__', session.origin)
  .replaceAll('__TASK00008_OWNER_SESSION__', session.ownerCookie)
  .replaceAll('__TASK00008_READER_SESSION__', session.readerCookie)
  .replaceAll('__TASK00008_ORDERS_FILE__', session.ordersFileId)
  .replaceAll('__TASK00008_CUSTOMERS_FILE__', session.customersFileId)
  .replaceAll('__TASK00008_KEYLESS_FILE__', session.keylessFileId);
await fs.writeFile(outputPath, materialized, { mode: 0o600 });

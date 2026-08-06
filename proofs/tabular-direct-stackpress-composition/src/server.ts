import { createProofRuntime } from './bootstrap.js';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;
const runtime = await createProofRuntime({ port });

console.log(`P-001 proof server listening at ${runtime.origin}/proof`);

async function shutdown() {
  await runtime.close();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

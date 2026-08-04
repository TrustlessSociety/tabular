export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
let minimumLevel: LogLevel = 'debug';
let contextFields: Record<string, unknown> = {};

export function configureLogging(level: LogLevel, fields: Record<string, unknown> = {}) {
  minimumLevel = level;
  contextFields = { ...fields };
}

export function writeLog(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {}
) {
  if (priorities[level] < priorities[minimumLevel]) return;
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
    ...contextFields
  });
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${record}\n`);
}

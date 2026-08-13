//The log level contract exported for module callers
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
let minimumLevel: LogLevel = 'debug';
let contextFields: Record<string, unknown> = {};

/**
 * Configure the process-wide minimum level and stable context fields.
 */
export function configureLogging(level: LogLevel, fields: Record<string, unknown> = {}) {
  //copy caller fields so later mutation cannot alter emitted records
  minimumLevel = level;
  contextFields = { ...fields };
}

/**
 * Write one structured log record when it meets the configured threshold.
 */
export function writeLog(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {}
) {
  //discard low-priority records before allocating timestamps or JSON
  if (priorities[level] < priorities[minimumLevel]) return;

  //stable process context wins over per-call fields for owned identifiers
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
    ...contextFields
  });

  //route only error records to stderr so process supervisors can distinguish
  // failures without losing structured output
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${record}\n`);
}

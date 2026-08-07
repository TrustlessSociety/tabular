//client
import type { BrowserMutationPrincipal, BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { OperationActivity, OperationActivityList, OperationState } from './contracts.js';
import { ApplicationError } from '../../../bootstrap/errors.js';

export type OperationsRouteService = {
  list(principal: BrowserPrincipal, input: { status?: OperationState[], limit?: number }): Promise<OperationActivityList>,
  get(principal: BrowserPrincipal, jobId: string): Promise<OperationActivity | undefined>,
  markRead(principal: BrowserMutationPrincipal, jobId: string): Promise<OperationActivity | undefined>,
  cancel(principal: BrowserMutationPrincipal, jobId: string): Promise<OperationActivity | undefined>,
  retry(principal: BrowserMutationPrincipal, jobId: string): Promise<OperationActivity | undefined>,
  acknowledge(principal: BrowserMutationPrincipal, jobId: string): Promise<OperationActivity | undefined>,
  retention(principal: BrowserMutationPrincipal, input: { retentionDays: number, limit: number }): Promise<unknown>,
};

export type OperationRouteAction =
  | { type: 'operation.retry', jobId: string }
  | { type: 'operation.cancel', jobId: string }
  | { type: 'operation.acknowledge', jobId: string }
  | { type: 'operation.mark-read', jobId: string }
  | { type: 'operations.retention.apply', retentionDays: number, limit: number };

export function operationAction(input: unknown): OperationRouteAction {
  const record = object(input, 'Operation action');
  const type = record.type;
  if (type === 'operations.retention.apply') {
    exactKeys(record, ['type', 'retentionDays', 'limit']);
    const retentionDays = boundedInteger(record.retentionDays, 'retention days', 30, 365);
    if (![30, 90, 180, 365].includes(retentionDays)) {
      throw new ApplicationError('invalid_action', 400, 'The retention period is invalid');
    }
    return {
      type,
      retentionDays,
      limit: boundedInteger(record.limit, 'retention limit', 1, 500)
    };
  }
  if (type === 'operation.retry' || type === 'operation.cancel'
    || type === 'operation.acknowledge' || type === 'operation.mark-read') {
    exactKeys(record, ['type', 'jobId']);
    return { type, jobId: jobId(record.jobId) };
  }
  throw new ApplicationError('invalid_action', 400, 'The operation action is invalid');
}

export function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))
    || allowed.some((key) => parameters.getAll(key).length > 1)) {
    throw new ApplicationError('invalid_query', 400, 'The operation query is invalid');
  }
}

export function displayConnectionName(connectionId: string) {
  const words = connectionId.replace(/[_-]+/g, ' ').trim();
  return words ? words[0]!.toLocaleUpperCase() + words.slice(1) : connectionId;
}

export function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).length !== allowed.length
    || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new ApplicationError('invalid_action', 400, 'The operation action envelope is invalid');
  }
}

export function jobId(value: unknown) {
  if (typeof value !== 'string' || !/^job_[A-Za-z0-9_-]{32,64}$/.test(value)) {
    throw new ApplicationError('invalid_action', 400, 'The operation ID is invalid');
  }
  return value;
}

export function requireJson(contentType: string | string[] | undefined) {
  if (typeof contentType !== 'string' || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new ApplicationError('invalid_content_type', 415, 'Operation actions require JSON');
  }
}

export function invalidSession(): never {
  throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
}

export function unavailable(): never {
  throw new ApplicationError('operation_unavailable', 404, 'The requested operation is unavailable');
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationError('invalid_action', 400, `${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new ApplicationError('invalid_action', 400, `The ${label} is invalid`);
  }
  return Number(value);
}

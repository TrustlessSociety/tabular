//client
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';

//The operation schema version value exported for module callers
export const OPERATION_SCHEMA_VERSION = 1 as const;

//The operation kind contract exported for module callers
export type OperationKind =
  | 'import.commit'
  | 'export.csv'
  | 'ddl.apply'
  | 'draft.promote'
  | 'row-order.maintenance'
  | 'maintenance.import-staging'
  | 'operations.retention';

//The operation authority contract exported for module callers
export type OperationAuthority = 'worker' | 'migrator';

//The operation state contract exported for module callers
export type OperationState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'dead-letter';

//The operation payload map contract exported for module callers
export type OperationPayloadMap = {
  'import.commit': { importId: string, },
  'export.csv': { exportRequestId: string, fileId: string, },
  'ddl.apply': { requestId: string, },
  'draft.promote': { draftId: string, },
  'row-order.maintenance': { maintenanceId: string, fileId: string, },
  'maintenance.import-staging': { limit: number, },
  'operations.retention': { retentionDays: number, limit: number, },
};

//The operation payload contract exported for module callers
export type OperationPayload<Kind extends OperationKind = OperationKind> =
  OperationPayloadMap[Kind];

//The enqueue operation contract exported for module callers
export type EnqueueOperation<Kind extends OperationKind = OperationKind> = {
  kind: Kind,
  authority: OperationAuthority,
  idempotencyKey: string,
  payload: OperationPayloadMap[Kind],
  fileId?: string,
  maxAttempts?: number,
  retainedUntil?: Date,
};

//The operation job contract exported for module callers
export type OperationJob<Kind extends OperationKind = OperationKind> = {
  id: string,
  connectionId: string,
  actorIdentityId: string,
  sessionId: string,
  historyScopeId: string,
  fileId?: string,
  kind: Kind,
  schemaVersion: typeof OPERATION_SCHEMA_VERSION,
  authority: OperationAuthority,
  payload: OperationPayloadMap[Kind],
  state: OperationState,
  progress: number,
  attempts: number,
  maxAttempts: number,
  version: number,
  lease?: {
    owner: string,
    token: string,
    expiresAt: string,
  },
  cancelRequestedAt?: string,
  irreversibleAt?: string,
};

//The operation result link contract exported for module callers
export type OperationResultLink = {
  kind: 'file',
  fileId: string,
  href: string,
};

//The operation activity contract exported for module callers
export type OperationActivity = {
  id: string,
  kind: OperationKind,
  state: OperationState,
  progress: number,
  attempt: number,
  maxAttempts: number,
  version: number,
  fileId?: string,
  createdAt: string,
  updatedAt: string,
  startedAt?: string,
  finishedAt?: string,
  cancelRequestedAt?: string,
  resultSummary?: Record<string, unknown>,
  errorSummary?: { code: string, message: string, retryable: boolean, },
  resultLink?: OperationResultLink,
  unread: boolean,
  readAt?: string,
  acknowledgedAt?: string,
  cancellable: boolean,
  retryable: boolean,
  acknowledgeable: boolean,
  irreversible: boolean,
};

//The operation activity list contract exported for module callers
export type OperationActivityList = {
  items: OperationActivity[],
  cursor: number,
  canManageRetention: boolean,
  retentionDays: number,
};

//The operation event contract exported for module callers
export type OperationEvent = {
  cursor: number,
  jobId: string,
  fileId?: string,
  state: OperationState,
  kind: OperationKind,
  progress: number,
  version: number,
  createdAt: string,
};

//The operation event batch contract exported for module callers
export type OperationEventBatch = {
  events: OperationEvent[],
  retainedFrom: number,
  highWater: number,
  scannedThrough: number,
  gap: boolean,
};

//The operation handler result contract exported for module callers
export type OperationHandlerResult = Record<string, unknown>;

//The operation handler context contract exported for module callers
export type OperationHandlerContext<Kind extends OperationKind> = {
  job: OperationJob<Kind>,
  signal: AbortSignal,
  heartbeat(progress?: number): Promise<boolean>,
  markIrreversible(): Promise<boolean>,
};

//The operation handler contract exported for module callers
export type OperationHandler<Kind extends OperationKind = OperationKind> = (
  context: OperationHandlerContext<Kind>
) => Promise<OperationHandlerResult>;

//The operation handler registration contract exported for module callers
export type OperationHandlerRegistration<Kind extends OperationKind = OperationKind> = {
  kind: Kind,
  authority: OperationAuthority,
  version: number,
  handler: OperationHandler<Kind>,
};

//The operation mutation principal contract exported for module callers
export type OperationMutationPrincipal = BrowserMutationPrincipal;
//The operation read principal contract exported for module callers
export type OperationReadPrincipal = BrowserPrincipal;

//The operation authority value exported for module callers
export const operationAuthority: Record<OperationKind, OperationAuthority> = {
  'import.commit': 'worker',
  'export.csv': 'worker',
  'ddl.apply': 'migrator',
  'draft.promote': 'worker',
  'row-order.maintenance': 'worker',
  'maintenance.import-staging': 'worker',
  'operations.retention': 'worker'
};

import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';

export const OPERATION_SCHEMA_VERSION = 1 as const;

export type OperationKind =
  | 'import.commit'
  | 'export.csv'
  | 'ddl.apply'
  | 'draft.promote'
  | 'row-order.maintenance'
  | 'maintenance.import-staging'
  | 'operations.retention';

export type OperationAuthority = 'worker' | 'migrator';

export type OperationState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'dead-letter';

export type OperationPayloadMap = {
  'import.commit': { importId: string };
  'export.csv': { exportRequestId: string; fileId: string };
  'ddl.apply': { requestId: string };
  'draft.promote': { draftId: string };
  'row-order.maintenance': { maintenanceId: string; fileId: string };
  'maintenance.import-staging': { limit: number };
  'operations.retention': { retentionDays: number; limit: number };
};

export type OperationPayload<Kind extends OperationKind = OperationKind> =
  OperationPayloadMap[Kind];

export type EnqueueOperation<Kind extends OperationKind = OperationKind> = {
  kind: Kind;
  authority: OperationAuthority;
  idempotencyKey: string;
  payload: OperationPayloadMap[Kind];
  fileId?: string;
  maxAttempts?: number;
  retainedUntil?: Date;
};

export type OperationJob<Kind extends OperationKind = OperationKind> = {
  id: string;
  connectionId: string;
  actorIdentityId: string;
  sessionId: string;
  historyScopeId: string;
  fileId?: string;
  kind: Kind;
  schemaVersion: typeof OPERATION_SCHEMA_VERSION;
  authority: OperationAuthority;
  payload: OperationPayloadMap[Kind];
  state: OperationState;
  progress: number;
  attempts: number;
  maxAttempts: number;
  version: number;
  lease?: {
    owner: string;
    token: string;
    expiresAt: string;
  };
  cancelRequestedAt?: string;
  irreversibleAt?: string;
};

export type OperationResultLink = {
  kind: 'file';
  fileId: string;
  href: string;
};

export type OperationActivity = {
  id: string;
  kind: OperationKind;
  state: OperationState;
  progress: number;
  attempt: number;
  maxAttempts: number;
  version: number;
  fileId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  cancelRequestedAt?: string;
  resultSummary?: Record<string, unknown>;
  errorSummary?: { code: string; message: string; retryable: boolean };
  resultLink?: OperationResultLink;
  unread: boolean;
  readAt?: string;
  acknowledgedAt?: string;
  cancellable: boolean;
  retryable: boolean;
  acknowledgeable: boolean;
  irreversible: boolean;
};

export type OperationActivityList = {
  items: OperationActivity[];
  cursor: number;
  canManageRetention: boolean;
  retentionDays: number;
};

export type OperationEvent = {
  cursor: number;
  jobId: string;
  fileId?: string;
  state: OperationState;
  kind: OperationKind;
  progress: number;
  version: number;
  createdAt: string;
};

export type OperationEventBatch = {
  events: OperationEvent[];
  retainedFrom: number;
  highWater: number;
  scannedThrough: number;
  gap: boolean;
};

export type OperationHandlerResult = Record<string, unknown>;

export type OperationHandlerContext<Kind extends OperationKind> = {
  job: OperationJob<Kind>;
  signal: AbortSignal;
  heartbeat(progress?: number): Promise<boolean>;
  markIrreversible(): Promise<boolean>;
};

export type OperationHandler<Kind extends OperationKind = OperationKind> = (
  context: OperationHandlerContext<Kind>
) => Promise<OperationHandlerResult>;

export type OperationHandlerRegistration<Kind extends OperationKind = OperationKind> = {
  kind: Kind;
  authority: OperationAuthority;
  version: number;
  handler: OperationHandler<Kind>;
};

export type OperationMutationPrincipal = BrowserMutationPrincipal;
export type OperationReadPrincipal = BrowserPrincipal;

export const operationAuthority: Record<OperationKind, OperationAuthority> = {
  'import.commit': 'worker',
  'export.csv': 'worker',
  'ddl.apply': 'migrator',
  'draft.promote': 'worker',
  'row-order.maintenance': 'worker',
  'maintenance.import-staging': 'worker',
  'operations.retention': 'worker'
};

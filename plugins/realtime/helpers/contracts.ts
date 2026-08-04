export type RealtimeEventType =
  | 'grid.changed'
  | 'schema.changed'
  | 'saved-view.changed'
  | 'saved-view.deleted'
  | 'row-order.changed'
  | 'row-order.maintenance';

export type RealtimeEvent = {
  cursor: number;
  fileId: string;
  type: RealtimeEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type RealtimeBatch = {
  events: RealtimeEvent[];
  retainedFrom: number;
  highWater: number;
  scannedThrough: number;
  gap: boolean;
};

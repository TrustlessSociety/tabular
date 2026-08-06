//The realtime event type contract exported for module callers
export type RealtimeEventType =
  | 'grid.changed'
  | 'schema.changed'
  | 'saved-view.changed'
  | 'saved-view.deleted'
  | 'row-order.changed'
  | 'row-order.maintenance';

//The realtime event contract exported for module callers
export type RealtimeEvent = {
  cursor: number,
  fileId: string,
  type: RealtimeEventType,
  payload: Record<string, unknown>,
  createdAt: string,
};

//The realtime batch contract exported for module callers
export type RealtimeBatch = {
  events: RealtimeEvent[],
  retainedFrom: number,
  highWater: number,
  scannedThrough: number,
  gap: boolean,
};

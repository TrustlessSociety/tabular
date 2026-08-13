//client
import type { RealtimeState } from '../../realtime/events/controller.js';
import type { ActivityItem } from '../components/activity-center.js';

//The activity snapshot contract exported for module callers
export type ActivitySnapshot = {
  items: ActivityItem[],
  cursor: number,
  canManageRetention: boolean,
  retentionDays?: number,
};

//The activity page props contract exported for module callers
export type ActivityPageProps = {
  application: 'Tabular',
  status: 'starting' | 'ready',
  version: string,
  surface: 'activity',
  connectionDisplayName: string,
  identity: { displayName: string, },
  csrfToken: string,
  snapshot: ActivitySnapshot,
};

//The activity connection state contract exported for module callers
export type ActivityConnectionState = RealtimeState;

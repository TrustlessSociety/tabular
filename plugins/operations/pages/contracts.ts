import type { RealtimeState } from '../../realtime/events/controller.js';
import type { ActivityItem } from '../components/activity-center.js';

export type ActivitySnapshot = {
  items: ActivityItem[];
  cursor: number;
  canManageRetention: boolean;
  retentionDays?: number;
};

export type ActivityPageProps = {
  application: 'Tabular';
  status: 'starting' | 'ready';
  version: string;
  surface: 'activity';
  connectionDisplayName: string;
  identity: { displayName: string };
  csrfToken: string;
  snapshot: ActivitySnapshot;
};

export type ActivityConnectionState = RealtimeState;

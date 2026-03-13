import type { UserId } from '@/kernel/domain/ids.js';

export type TicketHistoryAction =
  | 'created'
  | 'assigned'
  | 'reassigned'
  | 'unassigned'
  | 'moved'
  | 'done'
  | 'reopened'
  | 'commented';

export type TicketHistoryEntry = {
  action: TicketHistoryAction;
  actorId: UserId;
  data: Record<string, unknown>;
  timestamp: Date;
};

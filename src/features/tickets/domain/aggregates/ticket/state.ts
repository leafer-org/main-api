import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';
import type { TicketData } from '../../vo/ticket-data.js';
import type { TriggerId } from '../../vo/triggers.js';
import type { TicketHistoryEntry } from '../../vo/history.js';

export type TicketStatus = 'open' | 'in-progress' | 'done';

export type TicketState = EntityState<{
  ticketId: TicketId;
  boardId: BoardId;
  message: string;
  data: TicketData;
  triggerId: TriggerId | null;
  status: TicketStatus;
  assigneeId: UserId | null;
  history: TicketHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}>;

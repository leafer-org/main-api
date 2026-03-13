import type { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';
import type { TicketData } from '../../vo/ticket-data.js';
import type { TriggerId } from '../../vo/triggers.js';

export type TicketCreatedEvent = {
  type: 'ticket.created';
  ticketId: TicketId;
  boardId: BoardId;
  message: string;
  data: TicketData;
  triggerId: TriggerId | null;
  createdBy: UserId;
  createdAt: Date;
};

export type TicketAssignedEvent = {
  type: 'ticket.assigned';
  assigneeId: UserId;
  assignedAt: Date;
};

export type TicketReassignedEvent = {
  type: 'ticket.reassigned';
  assigneeId: UserId;
  reassignedBy: UserId;
  reassignedAt: Date;
};

export type TicketUnassignedEvent = {
  type: 'ticket.unassigned';
  unassignedAt: Date;
};

export type TicketMovedEvent = {
  type: 'ticket.moved';
  fromBoardId: BoardId;
  toBoardId: BoardId;
  movedBy: UserId;
  comment: string;
  movedAt: Date;
};

export type TicketMarkedDoneEvent = {
  type: 'ticket.marked-done';
  doneAt: Date;
};

export type TicketReopenedEvent = {
  type: 'ticket.reopened';
  reopenedBy: UserId;
  reopenedAt: Date;
};

export type TicketCommentedEvent = {
  type: 'ticket.commented';
  authorId: UserId;
  text: string;
  commentedAt: Date;
};

export type TicketEvent =
  | TicketCreatedEvent
  | TicketAssignedEvent
  | TicketReassignedEvent
  | TicketUnassignedEvent
  | TicketMovedEvent
  | TicketMarkedDoneEvent
  | TicketReopenedEvent
  | TicketCommentedEvent;

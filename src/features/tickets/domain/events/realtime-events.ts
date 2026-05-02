import type { TriggerId } from '../vo/triggers.js';
import type { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';

export type TicketRealtimeCreatedEvent = {
  type: 'ticket.created';
  ticketId: TicketId;
  boardId: BoardId;
  triggerId: TriggerId | null;
  createdBy: UserId;
};

export type TicketRealtimeAssignedEvent = {
  type: 'ticket.assigned';
  ticketId: TicketId;
  boardId: BoardId;
  assigneeId: UserId;
};

export type TicketRealtimeReassignedEvent = {
  type: 'ticket.reassigned';
  ticketId: TicketId;
  boardId: BoardId;
  oldAssigneeId: UserId;
  newAssigneeId: UserId;
  reassignedBy: UserId;
};

export type TicketRealtimeUnassignedEvent = {
  type: 'ticket.unassigned';
  ticketId: TicketId;
  boardId: BoardId;
  oldAssigneeId: UserId;
};

export type TicketRealtimeDoneEvent = {
  type: 'ticket.done';
  ticketId: TicketId;
  boardId: BoardId;
};

export type TicketRealtimeReopenedEvent = {
  type: 'ticket.reopened';
  ticketId: TicketId;
  boardId: BoardId;
  reopenedBy: UserId;
};

export type TicketRealtimeCommentedEvent = {
  type: 'ticket.commented';
  ticketId: TicketId;
  boardId: BoardId;
  authorId: UserId;
};

export type TicketRealtimeMovedEvent = {
  type: 'ticket.moved';
  ticketId: TicketId;
  fromBoardId: BoardId;
  toBoardId: BoardId;
  movedBy: UserId;
};

export type TicketRealtimeEvent =
  | TicketRealtimeCreatedEvent
  | TicketRealtimeAssignedEvent
  | TicketRealtimeReassignedEvent
  | TicketRealtimeUnassignedEvent
  | TicketRealtimeDoneEvent
  | TicketRealtimeReopenedEvent
  | TicketRealtimeCommentedEvent
  | TicketRealtimeMovedEvent;

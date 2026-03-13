import type { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';
import type { TicketData } from '../../vo/ticket-data.js';
import type { TriggerId } from '../../vo/triggers.js';

export type CreateTicketCommand = {
  type: 'CreateTicket';
  ticketId: TicketId;
  boardId: BoardId;
  message: string;
  data: TicketData;
  triggerId: TriggerId | null;
  createdBy: UserId;
  now: Date;
};

export type AssignTicketCommand = {
  type: 'AssignTicket';
  assigneeId: UserId;
  now: Date;
};

export type ReassignTicketCommand = {
  type: 'ReassignTicket';
  assigneeId: UserId;
  reassignedBy: UserId;
  now: Date;
};

export type UnassignTicketCommand = {
  type: 'UnassignTicket';
  now: Date;
};

export type MoveTicketCommand = {
  type: 'MoveTicket';
  toBoardId: BoardId;
  movedBy: UserId;
  comment: string;
  allowedTransferBoardIds: BoardId[];
  now: Date;
};

export type MarkDoneCommand = {
  type: 'MarkDone';
  now: Date;
};

export type ReopenTicketCommand = {
  type: 'ReopenTicket';
  reopenedBy: UserId;
  now: Date;
};

export type CommentTicketCommand = {
  type: 'CommentTicket';
  authorId: UserId;
  text: string;
  now: Date;
};

export type TicketCommand =
  | CreateTicketCommand
  | AssignTicketCommand
  | ReassignTicketCommand
  | UnassignTicketCommand
  | MoveTicketCommand
  | MarkDoneCommand
  | ReopenTicketCommand
  | CommentTicketCommand;

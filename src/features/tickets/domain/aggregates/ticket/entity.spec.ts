import { describe, expect, it } from 'vitest';

import { TicketEntity } from './entity.js';
import { isLeft } from '@/infra/lib/box.js';
import { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TICKET_ID = TicketId.raw('ticket-1');
const BOARD_ID = BoardId.raw('board-1');
const BOARD_2_ID = BoardId.raw('board-2');
const BOARD_3_ID = BoardId.raw('board-3');
const USER_1 = UserId.raw('user-1');
const USER_2 = UserId.raw('user-2');
const AI_AGENT_USER = UserId.raw('ai-agent-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

function createTicket() {
  const result = TicketEntity.create({
    type: 'CreateTicket',
    ticketId: TICKET_ID,
    boardId: BOARD_ID,
    message: 'Модерация товара: Test Item',
    data: {},
    triggerId: 'item-moderation.requested',
    eventId: null,
    createdBy: AI_AGENT_USER,
    now: NOW,
  });
  if (isLeft(result)) throw new Error('Expected Right');
  return result.value.state;
}

function assignedTicket() {
  const state = createTicket();
  const result = TicketEntity.assign(state, {
    type: 'AssignTicket',
    assigneeId: USER_1,
    now: NOW,
  });
  if (isLeft(result)) throw new Error('Expected Right');
  return result.value.state;
}

function doneTicket() {
  const state = assignedTicket();
  const result = TicketEntity.markDone(state, { type: 'MarkDone', now: NOW });
  if (isLeft(result)) throw new Error('Expected Right');
  return result.value.state;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TicketEntity', () => {
  describe('create', () => {
    it('creates ticket with open status and history entry', () => {
      const result = TicketEntity.create({
        type: 'CreateTicket',
        ticketId: TICKET_ID,
        boardId: BOARD_ID,
        message: 'Test message',
        data: {},
        triggerId: 'item-moderation.requested',
        eventId: null,
        createdBy: USER_1,
        now: NOW,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      const { state, event } = result.value;

      expect(event.type).toBe('ticket.created');
      expect(event.ticketId).toBe(TICKET_ID);
      expect(event.boardId).toBe(BOARD_ID);

      expect(state.status).toBe('open');
      expect(state.assigneeId).toBeNull();
      expect(state.triggerId).toBe('item-moderation.requested');
      expect(state.history).toHaveLength(1);
      expect(state.history[0]!.action).toBe('created');
      expect(state.history[0]!.actorId).toBe(USER_1);
    });

    it('creates manual ticket with null triggerId', () => {
      const result = TicketEntity.create({
        type: 'CreateTicket',
        ticketId: TICKET_ID,
        boardId: BOARD_ID,
        message: 'Manual ticket',
        data: {},
        triggerId: null,
        eventId: null,
        createdBy: USER_1,
        now: NOW,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.triggerId).toBeNull();
    });
  });

  describe('assign', () => {
    it('assigns open ticket and sets in-progress', () => {
      const state = createTicket();
      const result = TicketEntity.assign(state, {
        type: 'AssignTicket',
        assigneeId: USER_1,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.status).toBe('in-progress');
      expect(result.value.state.assigneeId).toBe(USER_1);
      expect(result.value.event.type).toBe('ticket.assigned');
      expect(result.value.state.history).toHaveLength(2);
      expect(result.value.state.history[1]!.action).toBe('assigned');
    });

    it('returns TicketNotOpenError if in-progress', () => {
      const state = assignedTicket();
      const result = TicketEntity.assign(state, {
        type: 'AssignTicket',
        assigneeId: USER_2,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_not_open');
      }
    });

    it('returns TicketNotOpenError if done', () => {
      const state = doneTicket();
      const result = TicketEntity.assign(state, {
        type: 'AssignTicket',
        assigneeId: USER_2,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_not_open');
      }
    });
  });

  describe('reassign', () => {
    it('reassigns in-progress ticket to another user', () => {
      const state = assignedTicket();
      const result = TicketEntity.reassign(state, {
        type: 'ReassignTicket',
        assigneeId: USER_2,
        reassignedBy: USER_1,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.assigneeId).toBe(USER_2);
      expect(result.value.state.status).toBe('in-progress');
      expect(result.value.event.type).toBe('ticket.reassigned');
      const lastEntry = result.value.state.history.at(-1)!;
      expect(lastEntry.action).toBe('reassigned');
      expect(lastEntry.data).toEqual({ newAssigneeId: USER_2 });
    });

    it('returns TicketNotInProgressError if open', () => {
      const state = createTicket();
      const result = TicketEntity.reassign(state, {
        type: 'ReassignTicket',
        assigneeId: USER_2,
        reassignedBy: USER_1,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_not_in_progress');
      }
    });
  });

  describe('unassign', () => {
    it('unassigns in-progress ticket back to open', () => {
      const state = assignedTicket();
      const result = TicketEntity.unassign(state, {
        type: 'UnassignTicket',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.status).toBe('open');
      expect(result.value.state.assigneeId).toBeNull();
      expect(result.value.event.type).toBe('ticket.unassigned');
    });

    it('returns TicketNotInProgressError if open', () => {
      const state = createTicket();
      const result = TicketEntity.unassign(state, {
        type: 'UnassignTicket',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_not_in_progress');
      }
    });
  });

  describe('move', () => {
    it('moves open ticket to allowed board', () => {
      const state = createTicket();
      const result = TicketEntity.move(state, {
        type: 'MoveTicket',
        toBoardId: BOARD_2_ID,
        movedBy: USER_1,
        comment: 'Нужна ручная проверка',
        allowedTransferBoardIds: [BOARD_2_ID, BOARD_3_ID],
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.boardId).toBe(BOARD_2_ID);
      expect(result.value.state.status).toBe('open');
      expect(result.value.state.assigneeId).toBeNull();
      expect(result.value.event.type).toBe('ticket.moved');
      expect(result.value.event.fromBoardId).toBe(BOARD_ID);
      expect(result.value.event.toBoardId).toBe(BOARD_2_ID);

      const lastEntry = result.value.state.history.at(-1)!;
      expect(lastEntry.action).toBe('moved');
      expect(lastEntry.data).toEqual({
        fromBoardId: BOARD_ID,
        toBoardId: BOARD_2_ID,
        comment: 'Нужна ручная проверка',
      });
    });

    it('moves in-progress ticket (resets to open)', () => {
      const state = assignedTicket();
      const result = TicketEntity.move(state, {
        type: 'MoveTicket',
        toBoardId: BOARD_2_ID,
        movedBy: USER_1,
        comment: 'Эскалация',
        allowedTransferBoardIds: [BOARD_2_ID],
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.status).toBe('open');
      expect(result.value.state.assigneeId).toBeNull();
    });

    it('returns error if ticket is done', () => {
      const state = doneTicket();
      const result = TicketEntity.move(state, {
        type: 'MoveTicket',
        toBoardId: BOARD_2_ID,
        movedBy: USER_1,
        comment: 'reason',
        allowedTransferBoardIds: [BOARD_2_ID],
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
    });

    it('returns TicketTransferNotAllowedError if board not in allowed list', () => {
      const state = createTicket();
      const result = TicketEntity.move(state, {
        type: 'MoveTicket',
        toBoardId: BOARD_3_ID,
        movedBy: USER_1,
        comment: 'reason',
        allowedTransferBoardIds: [BOARD_2_ID],
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_transfer_not_allowed');
      }
    });

    it('returns TicketTransferNotAllowedError if allowed list is empty', () => {
      const state = createTicket();
      const result = TicketEntity.move(state, {
        type: 'MoveTicket',
        toBoardId: BOARD_2_ID,
        movedBy: USER_1,
        comment: 'reason',
        allowedTransferBoardIds: [],
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_transfer_not_allowed');
      }
    });
  });

  describe('markDone', () => {
    it('marks in-progress ticket as done', () => {
      const state = assignedTicket();
      const result = TicketEntity.markDone(state, { type: 'MarkDone', now: LATER });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.status).toBe('done');
      expect(result.value.event.type).toBe('ticket.marked-done');
      const lastEntry = result.value.state.history.at(-1)!;
      expect(lastEntry.action).toBe('done');
    });

    it('returns TicketNotInProgressError if open', () => {
      const state = createTicket();
      const result = TicketEntity.markDone(state, { type: 'MarkDone', now: LATER });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_not_in_progress');
      }
    });

    it('returns TicketNotInProgressError if done', () => {
      const state = doneTicket();
      const result = TicketEntity.markDone(state, { type: 'MarkDone', now: LATER });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_not_in_progress');
      }
    });
  });

  describe('reopen', () => {
    it('reopens done ticket back to open', () => {
      const state = doneTicket();
      const result = TicketEntity.reopen(state, {
        type: 'ReopenTicket',
        reopenedBy: USER_1,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.status).toBe('open');
      expect(result.value.state.assigneeId).toBeNull();
      expect(result.value.event.type).toBe('ticket.reopened');
    });

    it('returns TicketNotDoneError if open', () => {
      const state = createTicket();
      const result = TicketEntity.reopen(state, {
        type: 'ReopenTicket',
        reopenedBy: USER_1,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_not_done');
      }
    });

    it('returns TicketNotDoneError if in-progress', () => {
      const state = assignedTicket();
      const result = TicketEntity.reopen(state, {
        type: 'ReopenTicket',
        reopenedBy: USER_1,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('ticket_not_done');
      }
    });
  });

  describe('comment', () => {
    it('adds comment without changing status', () => {
      const state = createTicket();
      const result = TicketEntity.comment(state, {
        type: 'CommentTicket',
        authorId: USER_1,
        text: 'Some comment',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.status).toBe('open');
      expect(result.value.event.type).toBe('ticket.commented');
      expect(result.value.event.text).toBe('Some comment');

      const lastEntry = result.value.state.history.at(-1)!;
      expect(lastEntry.action).toBe('commented');
      expect(lastEntry.data).toEqual({ text: 'Some comment' });
    });

    it('allows AI agent user as author', () => {
      const state = assignedTicket();
      const result = TicketEntity.comment(state, {
        type: 'CommentTicket',
        authorId: AI_AGENT_USER,
        text: 'LLM decision: approved',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      const lastEntry = result.value.state.history.at(-1)!;
      expect(lastEntry.actorId).toBe(AI_AGENT_USER);
    });
  });
});

import type { TicketHistoryEntry } from '../../vo/history.js';
import type {
  AssignTicketCommand,
  CommentTicketCommand,
  CreateTicketCommand,
  MarkDoneCommand,
  MoveTicketCommand,
  ReassignTicketCommand,
  ReopenTicketCommand,
  UnassignTicketCommand,
} from './commands.js';
import {
  TicketNotDoneError,
  TicketNotInProgressError,
  TicketNotOpenError,
  TicketTransferNotAllowedError,
} from './errors.js';
import type {
  TicketAssignedEvent,
  TicketCommentedEvent,
  TicketCreatedEvent,
  TicketMarkedDoneEvent,
  TicketMovedEvent,
  TicketReassignedEvent,
  TicketReopenedEvent,
  TicketUnassignedEvent,
} from './events.js';
import type { TicketState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

function historyEntry(
  action: TicketHistoryEntry['action'],
  actorId: TicketHistoryEntry['actorId'],
  timestamp: Date,
  data: Record<string, unknown> = {},
): TicketHistoryEntry {
  return { action, actorId, data, timestamp };
}

export type { TicketState } from './state.js';

export const TicketEntity = {
  create(
    cmd: CreateTicketCommand,
  ): Either<never, { state: TicketState; event: TicketCreatedEvent }> {
    const event: TicketCreatedEvent = {
      type: 'ticket.created',
      ticketId: cmd.ticketId,
      boardId: cmd.boardId,
      message: cmd.message,
      data: cmd.data,
      triggerId: cmd.triggerId,
      createdBy: cmd.createdBy,
      createdAt: cmd.now,
    };

    const state: TicketState = {
      ticketId: cmd.ticketId,
      boardId: cmd.boardId,
      message: cmd.message,
      data: cmd.data,
      triggerId: cmd.triggerId,
      status: 'open',
      assigneeId: null,
      history: [historyEntry('created', cmd.createdBy, cmd.now)],
      createdAt: cmd.now,
      updatedAt: cmd.now,
    };

    return Right({ state, event });
  },

  assign(
    state: TicketState,
    cmd: AssignTicketCommand,
  ): Either<TicketNotOpenError, { state: TicketState; event: TicketAssignedEvent }> {
    if (state.status !== 'open') {
      return Left(new TicketNotOpenError());
    }

    const event: TicketAssignedEvent = {
      type: 'ticket.assigned',
      assigneeId: cmd.assigneeId,
      assignedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        status: 'in-progress',
        assigneeId: cmd.assigneeId,
        history: [...state.history, historyEntry('assigned', cmd.assigneeId, cmd.now)],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  reassign(
    state: TicketState,
    cmd: ReassignTicketCommand,
  ): Either<TicketNotInProgressError, { state: TicketState; event: TicketReassignedEvent }> {
    if (state.status !== 'in-progress') {
      return Left(new TicketNotInProgressError());
    }

    const event: TicketReassignedEvent = {
      type: 'ticket.reassigned',
      assigneeId: cmd.assigneeId,
      reassignedBy: cmd.reassignedBy,
      reassignedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        assigneeId: cmd.assigneeId,
        history: [
          ...state.history,
          historyEntry('reassigned', cmd.reassignedBy, cmd.now, {
            newAssigneeId: cmd.assigneeId,
          }),
        ],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  unassign(
    state: TicketState,
    cmd: UnassignTicketCommand,
  ): Either<TicketNotInProgressError, { state: TicketState; event: TicketUnassignedEvent }> {
    if (state.status !== 'in-progress') {
      return Left(new TicketNotInProgressError());
    }

    const event: TicketUnassignedEvent = {
      type: 'ticket.unassigned',
      unassignedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        status: 'open',
        assigneeId: null,
        history: [...state.history, historyEntry('unassigned', state.assigneeId!, cmd.now)],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  move(
    state: TicketState,
    cmd: MoveTicketCommand,
  ): Either<
    TicketNotOpenError | TicketNotInProgressError | TicketTransferNotAllowedError,
    { state: TicketState; event: TicketMovedEvent }
  > {
    if (state.status === 'done') {
      return Left(new TicketNotOpenError());
    }

    const isAllowed = cmd.allowedTransferBoardIds.some(
      (id) => (id as string) === (cmd.toBoardId as string),
    );
    if (!isAllowed) {
      return Left(new TicketTransferNotAllowedError());
    }

    const event: TicketMovedEvent = {
      type: 'ticket.moved',
      fromBoardId: state.boardId,
      toBoardId: cmd.toBoardId,
      movedBy: cmd.movedBy,
      comment: cmd.comment,
      movedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        boardId: cmd.toBoardId,
        status: 'open',
        assigneeId: null,
        history: [
          ...state.history,
          historyEntry('moved', cmd.movedBy, cmd.now, {
            fromBoardId: state.boardId,
            toBoardId: cmd.toBoardId,
            comment: cmd.comment,
          }),
        ],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  markDone(
    state: TicketState,
    cmd: MarkDoneCommand,
  ): Either<TicketNotInProgressError, { state: TicketState; event: TicketMarkedDoneEvent }> {
    if (state.status !== 'in-progress') {
      return Left(new TicketNotInProgressError());
    }

    const event: TicketMarkedDoneEvent = {
      type: 'ticket.marked-done',
      doneAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        status: 'done',
        history: [...state.history, historyEntry('done', state.assigneeId!, cmd.now)],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  reopen(
    state: TicketState,
    cmd: ReopenTicketCommand,
  ): Either<TicketNotDoneError, { state: TicketState; event: TicketReopenedEvent }> {
    if (state.status !== 'done') {
      return Left(new TicketNotDoneError());
    }

    const event: TicketReopenedEvent = {
      type: 'ticket.reopened',
      reopenedBy: cmd.reopenedBy,
      reopenedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        status: 'open',
        assigneeId: null,
        history: [...state.history, historyEntry('reopened', cmd.reopenedBy, cmd.now)],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  comment(
    state: TicketState,
    cmd: CommentTicketCommand,
  ): Either<never, { state: TicketState; event: TicketCommentedEvent }> {
    const event: TicketCommentedEvent = {
      type: 'ticket.commented',
      authorId: cmd.authorId,
      text: cmd.text,
      commentedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        history: [
          ...state.history,
          historyEntry('commented', cmd.authorId, cmd.now, { text: cmd.text }),
        ],
        updatedAt: cmd.now,
      },
      event,
    });
  },
};

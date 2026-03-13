import type {
  AddAutomationCommand,
  AddMemberCommand,
  AddSubscriptionCommand,
  CreateBoardCommand,
  RemoveAutomationCommand,
  RemoveMemberCommand,
  RemoveSubscriptionCommand,
  UpdateBoardCommand,
} from './commands.js';
import { BoardAutomationEntity } from './entities/board-automation.entity.js';
import { BoardSubscriptionEntity } from './entities/board-subscription.entity.js';
import {
  AutomationNotFoundError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  SubscriptionNotFoundError,
} from './errors.js';
import type {
  BoardAutomationAddedEvent,
  BoardAutomationRemovedEvent,
  BoardCreatedEvent,
  BoardMemberAddedEvent,
  BoardMemberRemovedEvent,
  BoardSubscriptionAddedEvent,
  BoardSubscriptionRemovedEvent,
  BoardUpdatedEvent,
} from './events.js';
import type { BoardState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export type { BoardState } from './state.js';
export { BoardSubscriptionEntity, BoardAutomationEntity };

export const BoardEntity = {
  create(cmd: CreateBoardCommand): Either<never, { state: BoardState; event: BoardCreatedEvent }> {
    const event: BoardCreatedEvent = {
      type: 'board.created',
      boardId: cmd.boardId,
      name: cmd.name,
      description: cmd.description,
      scope: cmd.scope,
      organizationId: cmd.organizationId,
      manualCreation: cmd.manualCreation,
      createdAt: cmd.now,
    };

    const state: BoardState = {
      boardId: cmd.boardId,
      name: cmd.name,
      description: cmd.description,
      scope: cmd.scope,
      organizationId: cmd.organizationId,
      subscriptions: [],
      manualCreation: cmd.manualCreation,
      allowedTransferBoardIds: [],
      memberIds: [],
      automations: [],
      createdAt: cmd.now,
      updatedAt: cmd.now,
    };

    return Right({ state, event });
  },

  update(
    state: BoardState,
    cmd: UpdateBoardCommand,
  ): Either<never, { state: BoardState; event: BoardUpdatedEvent }> {
    const event: BoardUpdatedEvent = {
      type: 'board.updated',
      name: cmd.name,
      description: cmd.description,
      manualCreation: cmd.manualCreation,
      allowedTransferBoardIds: cmd.allowedTransferBoardIds,
      updatedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        name: cmd.name,
        description: cmd.description,
        manualCreation: cmd.manualCreation,
        allowedTransferBoardIds: cmd.allowedTransferBoardIds,
        updatedAt: cmd.now,
      },
      event,
    });
  },

  addSubscription(
    state: BoardState,
    cmd: AddSubscriptionCommand,
  ): Either<never, { state: BoardState; event: BoardSubscriptionAddedEvent }> {
    const subscription = BoardSubscriptionEntity.create(
      cmd.subscriptionId,
      cmd.triggerId,
      cmd.filters,
    );

    const event: BoardSubscriptionAddedEvent = {
      type: 'board.subscription-added',
      subscription,
      addedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        subscriptions: [...state.subscriptions, subscription],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  removeSubscription(
    state: BoardState,
    cmd: RemoveSubscriptionCommand,
  ): Either<
    SubscriptionNotFoundError,
    { state: BoardState; event: BoardSubscriptionRemovedEvent }
  > {
    const exists = state.subscriptions.some(
      (s) => (s.id as string) === (cmd.subscriptionId as string),
    );
    if (!exists) {
      return Left(new SubscriptionNotFoundError());
    }

    const event: BoardSubscriptionRemovedEvent = {
      type: 'board.subscription-removed',
      subscriptionId: cmd.subscriptionId,
      removedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        subscriptions: state.subscriptions.filter(
          (s) => (s.id as string) !== (cmd.subscriptionId as string),
        ),
        updatedAt: cmd.now,
      },
      event,
    });
  },

  addMember(
    state: BoardState,
    cmd: AddMemberCommand,
  ): Either<MemberAlreadyExistsError, { state: BoardState; event: BoardMemberAddedEvent }> {
    const exists = state.memberIds.some((id) => (id as string) === (cmd.userId as string));
    if (exists) {
      return Left(new MemberAlreadyExistsError());
    }

    const event: BoardMemberAddedEvent = {
      type: 'board.member-added',
      userId: cmd.userId,
      addedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        memberIds: [...state.memberIds, cmd.userId],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  removeMember(
    state: BoardState,
    cmd: RemoveMemberCommand,
  ): Either<MemberNotFoundError, { state: BoardState; event: BoardMemberRemovedEvent }> {
    const exists = state.memberIds.some((id) => (id as string) === (cmd.userId as string));
    if (!exists) {
      return Left(new MemberNotFoundError());
    }

    const event: BoardMemberRemovedEvent = {
      type: 'board.member-removed',
      userId: cmd.userId,
      removedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        memberIds: state.memberIds.filter((id) => (id as string) !== (cmd.userId as string)),
        updatedAt: cmd.now,
      },
      event,
    });
  },

  addAutomation(
    state: BoardState,
    cmd: AddAutomationCommand,
  ): Either<never, { state: BoardState; event: BoardAutomationAddedEvent }> {
    const automation = BoardAutomationEntity.create(
      cmd.automationId,
      cmd.agentId,
      cmd.systemPrompt,
      cmd.onUncertainMoveToBoardId,
    );

    const event: BoardAutomationAddedEvent = {
      type: 'board.automation-added',
      automation,
      addedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        automations: [...state.automations, automation],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  removeAutomation(
    state: BoardState,
    cmd: RemoveAutomationCommand,
  ): Either<AutomationNotFoundError, { state: BoardState; event: BoardAutomationRemovedEvent }> {
    const exists = state.automations.some((a) => (a.id as string) === (cmd.automationId as string));
    if (!exists) {
      return Left(new AutomationNotFoundError());
    }

    const event: BoardAutomationRemovedEvent = {
      type: 'board.automation-removed',
      automationId: cmd.automationId,
      removedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        automations: state.automations.filter(
          (a) => (a.id as string) !== (cmd.automationId as string),
        ),
        updatedAt: cmd.now,
      },
      event,
    });
  },
};

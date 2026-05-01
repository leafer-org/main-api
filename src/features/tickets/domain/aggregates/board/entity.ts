import type {
  AddAutomationCommand,
  AddCloseSubscriptionCommand,
  AddMemberCommand,
  AddRedirectSubscriptionCommand,
  AddSubscriptionCommand,
  CreateBoardCommand,
  RemoveAutomationCommand,
  RemoveCloseSubscriptionCommand,
  RemoveMemberCommand,
  RemoveRedirectSubscriptionCommand,
  RemoveSubscriptionCommand,
  UpdateBoardCommand,
} from './commands.js';
import { BoardAutomationEntity } from './entities/board-automation.entity.js';
import { BoardSubscriptionEntity } from './entities/board-subscription.entity.js';
import { CloseSubscriptionEntity } from './entities/close-subscription.entity.js';
import { RedirectSubscriptionEntity } from './entities/redirect-subscription.entity.js';
import {
  AutomationNotFoundError,
  CloseSubscriptionNotFoundError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  RedirectSubscriptionNotFoundError,
  SubscriptionNotFoundError,
} from './errors.js';
import type {
  BoardAutomationAddedEvent,
  BoardAutomationRemovedEvent,
  BoardCloseSubscriptionAddedEvent,
  BoardCloseSubscriptionRemovedEvent,
  BoardCreatedEvent,
  BoardMemberAddedEvent,
  BoardMemberRemovedEvent,
  BoardRedirectSubscriptionAddedEvent,
  BoardRedirectSubscriptionRemovedEvent,
  BoardSubscriptionAddedEvent,
  BoardSubscriptionRemovedEvent,
  BoardUpdatedEvent,
} from './events.js';
import type { BoardState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export type { BoardState } from './state.js';
export { BoardSubscriptionEntity, BoardAutomationEntity, CloseSubscriptionEntity, RedirectSubscriptionEntity };

export const BoardEntity = {
  create(cmd: CreateBoardCommand): Either<never, { state: BoardState; event: BoardCreatedEvent }> {
    const state: BoardState = {
      boardId: cmd.boardId,
      name: cmd.name,
      description: cmd.description,
      scope: cmd.scope,
      organizationId: cmd.organizationId,
      subscriptions: [],
      closeSubscriptions: [],
      redirectSubscriptions: [],
      manualCreation: cmd.manualCreation,
      allowedTransferBoardIds: [],
      memberIds: [],
      automations: [],
      createdAt: cmd.now,
      updatedAt: cmd.now,
    };

    return Right({
      state,
      event: {
        type: 'board.created',
        boardId: cmd.boardId,
        name: cmd.name,
        description: cmd.description,
        scope: cmd.scope,
        organizationId: cmd.organizationId,
        manualCreation: cmd.manualCreation,
        createdAt: cmd.now,
      },
    });
  },

  update(
    state: BoardState,
    cmd: UpdateBoardCommand,
  ): Either<never, { state: BoardState; event: BoardUpdatedEvent }> {
    return Right({
      state: {
        ...state,
        name: cmd.name,
        description: cmd.description,
        manualCreation: cmd.manualCreation,
        allowedTransferBoardIds: cmd.allowedTransferBoardIds,
        updatedAt: cmd.now,
      },
      event: {
        type: 'board.updated',
        name: cmd.name,
        description: cmd.description,
        manualCreation: cmd.manualCreation,
        allowedTransferBoardIds: cmd.allowedTransferBoardIds,
        updatedAt: cmd.now,
      },
    });
  },

  // --- Open subscriptions ---

  addSubscription(
    state: BoardState,
    cmd: AddSubscriptionCommand,
  ): Either<never, { state: BoardState; event: BoardSubscriptionAddedEvent }> {
    const subscription = BoardSubscriptionEntity.create(cmd.subscriptionId, cmd.triggerId, cmd.filters);
    return Right({
      state: { ...state, subscriptions: [...state.subscriptions, subscription], updatedAt: cmd.now },
      event: { type: 'board.subscription-added', subscription, addedAt: cmd.now },
    });
  },

  removeSubscription(
    state: BoardState,
    cmd: RemoveSubscriptionCommand,
  ): Either<SubscriptionNotFoundError, { state: BoardState; event: BoardSubscriptionRemovedEvent }> {
    if (!state.subscriptions.some((s) => (s.id as string) === (cmd.subscriptionId as string)))
      return Left(new SubscriptionNotFoundError());
    return Right({
      state: { ...state, subscriptions: state.subscriptions.filter((s) => (s.id as string) !== (cmd.subscriptionId as string)), updatedAt: cmd.now },
      event: { type: 'board.subscription-removed', subscriptionId: cmd.subscriptionId, removedAt: cmd.now },
    });
  },

  // --- Close subscriptions ---

  addCloseSubscription(
    state: BoardState,
    cmd: AddCloseSubscriptionCommand,
  ): Either<never, { state: BoardState; event: BoardCloseSubscriptionAddedEvent }> {
    const subscription = CloseSubscriptionEntity.create(cmd.subscriptionId, cmd.triggerId, cmd.filters, cmd.addComment);
    return Right({
      state: { ...state, closeSubscriptions: [...state.closeSubscriptions, subscription], updatedAt: cmd.now },
      event: { type: 'board.close-subscription-added', subscription, addedAt: cmd.now },
    });
  },

  removeCloseSubscription(
    state: BoardState,
    cmd: RemoveCloseSubscriptionCommand,
  ): Either<CloseSubscriptionNotFoundError, { state: BoardState; event: BoardCloseSubscriptionRemovedEvent }> {
    if (!state.closeSubscriptions.some((s) => (s.id as string) === (cmd.subscriptionId as string)))
      return Left(new CloseSubscriptionNotFoundError());
    return Right({
      state: { ...state, closeSubscriptions: state.closeSubscriptions.filter((s) => (s.id as string) !== (cmd.subscriptionId as string)), updatedAt: cmd.now },
      event: { type: 'board.close-subscription-removed', subscriptionId: cmd.subscriptionId, removedAt: cmd.now },
    });
  },

  // --- Redirect subscriptions ---

  addRedirectSubscription(
    state: BoardState,
    cmd: AddRedirectSubscriptionCommand,
  ): Either<never, { state: BoardState; event: BoardRedirectSubscriptionAddedEvent }> {
    const subscription = RedirectSubscriptionEntity.create({
      id: cmd.subscriptionId, triggerId: cmd.triggerId, filters: cmd.filters,
      targetBoardId: cmd.targetBoardId, addComment: cmd.addComment, commentTemplate: cmd.commentTemplate,
    });
    return Right({
      state: { ...state, redirectSubscriptions: [...state.redirectSubscriptions, subscription], updatedAt: cmd.now },
      event: { type: 'board.redirect-subscription-added', subscription, addedAt: cmd.now },
    });
  },

  removeRedirectSubscription(
    state: BoardState,
    cmd: RemoveRedirectSubscriptionCommand,
  ): Either<RedirectSubscriptionNotFoundError, { state: BoardState; event: BoardRedirectSubscriptionRemovedEvent }> {
    if (!state.redirectSubscriptions.some((s) => (s.id as string) === (cmd.subscriptionId as string)))
      return Left(new RedirectSubscriptionNotFoundError());
    return Right({
      state: { ...state, redirectSubscriptions: state.redirectSubscriptions.filter((s) => (s.id as string) !== (cmd.subscriptionId as string)), updatedAt: cmd.now },
      event: { type: 'board.redirect-subscription-removed', subscriptionId: cmd.subscriptionId, removedAt: cmd.now },
    });
  },

  // --- Members ---

  addMember(
    state: BoardState,
    cmd: AddMemberCommand,
  ): Either<MemberAlreadyExistsError, { state: BoardState; event: BoardMemberAddedEvent }> {
    if (state.memberIds.some((id) => (id as string) === (cmd.userId as string)))
      return Left(new MemberAlreadyExistsError());
    return Right({
      state: { ...state, memberIds: [...state.memberIds, cmd.userId], updatedAt: cmd.now },
      event: { type: 'board.member-added', userId: cmd.userId, addedAt: cmd.now },
    });
  },

  removeMember(
    state: BoardState,
    cmd: RemoveMemberCommand,
  ): Either<MemberNotFoundError, { state: BoardState; event: BoardMemberRemovedEvent }> {
    if (!state.memberIds.some((id) => (id as string) === (cmd.userId as string)))
      return Left(new MemberNotFoundError());
    return Right({
      state: { ...state, memberIds: state.memberIds.filter((id) => (id as string) !== (cmd.userId as string)), updatedAt: cmd.now },
      event: { type: 'board.member-removed', userId: cmd.userId, removedAt: cmd.now },
    });
  },

  // --- Automations ---

  addAutomation(
    state: BoardState,
    cmd: AddAutomationCommand,
  ): Either<never, { state: BoardState; event: BoardAutomationAddedEvent }> {
    const automation = BoardAutomationEntity.create(cmd.automationId, cmd.agentId, cmd.systemPrompt, cmd.onUncertainMoveToBoardId);
    return Right({
      state: { ...state, automations: [...state.automations, automation], updatedAt: cmd.now },
      event: { type: 'board.automation-added', automation, addedAt: cmd.now },
    });
  },

  removeAutomation(
    state: BoardState,
    cmd: RemoveAutomationCommand,
  ): Either<AutomationNotFoundError, { state: BoardState; event: BoardAutomationRemovedEvent }> {
    if (!state.automations.some((a) => (a.id as string) === (cmd.automationId as string)))
      return Left(new AutomationNotFoundError());
    return Right({
      state: { ...state, automations: state.automations.filter((a) => (a.id as string) !== (cmd.automationId as string)), updatedAt: cmd.now },
      event: { type: 'board.automation-removed', automationId: cmd.automationId, removedAt: cmd.now },
    });
  },
};

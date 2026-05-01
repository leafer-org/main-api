import type { BoardAutomationEntity } from './entities/board-automation.entity.js';
import type { BoardSubscriptionEntity } from './entities/board-subscription.entity.js';
import type { CloseSubscriptionEntity } from './entities/close-subscription.entity.js';
import type { RedirectSubscriptionEntity } from './entities/redirect-subscription.entity.js';
import type { BoardScope } from './state.js';
import type {
  BoardAutomationId,
  BoardCloseSubscriptionId,
  BoardId,
  BoardRedirectSubscriptionId,
  BoardSubscriptionId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

export type BoardCreatedEvent = {
  type: 'board.created';
  boardId: BoardId;
  name: string;
  description: string | null;
  scope: BoardScope;
  organizationId: OrganizationId | null;
  manualCreation: boolean;
  createdAt: Date;
};

export type BoardUpdatedEvent = {
  type: 'board.updated';
  name: string;
  description: string | null;
  manualCreation: boolean;
  allowedTransferBoardIds: BoardId[];
  updatedAt: Date;
};

export type BoardSubscriptionAddedEvent = {
  type: 'board.subscription-added';
  subscription: BoardSubscriptionEntity;
  addedAt: Date;
};

export type BoardSubscriptionRemovedEvent = {
  type: 'board.subscription-removed';
  subscriptionId: BoardSubscriptionId;
  removedAt: Date;
};

export type BoardCloseSubscriptionAddedEvent = {
  type: 'board.close-subscription-added';
  subscription: CloseSubscriptionEntity;
  addedAt: Date;
};

export type BoardCloseSubscriptionRemovedEvent = {
  type: 'board.close-subscription-removed';
  subscriptionId: BoardCloseSubscriptionId;
  removedAt: Date;
};

export type BoardRedirectSubscriptionAddedEvent = {
  type: 'board.redirect-subscription-added';
  subscription: RedirectSubscriptionEntity;
  addedAt: Date;
};

export type BoardRedirectSubscriptionRemovedEvent = {
  type: 'board.redirect-subscription-removed';
  subscriptionId: BoardRedirectSubscriptionId;
  removedAt: Date;
};

export type BoardMemberAddedEvent = {
  type: 'board.member-added';
  userId: UserId;
  addedAt: Date;
};

export type BoardMemberRemovedEvent = {
  type: 'board.member-removed';
  userId: UserId;
  removedAt: Date;
};

export type BoardAutomationAddedEvent = {
  type: 'board.automation-added';
  automation: BoardAutomationEntity;
  addedAt: Date;
};

export type BoardAutomationRemovedEvent = {
  type: 'board.automation-removed';
  automationId: BoardAutomationId;
  removedAt: Date;
};

export type BoardEvent =
  | BoardCreatedEvent
  | BoardUpdatedEvent
  | BoardSubscriptionAddedEvent
  | BoardSubscriptionRemovedEvent
  | BoardCloseSubscriptionAddedEvent
  | BoardCloseSubscriptionRemovedEvent
  | BoardRedirectSubscriptionAddedEvent
  | BoardRedirectSubscriptionRemovedEvent
  | BoardMemberAddedEvent
  | BoardMemberRemovedEvent
  | BoardAutomationAddedEvent
  | BoardAutomationRemovedEvent;

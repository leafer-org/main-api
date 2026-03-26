import type { BoardAutomationEntity } from './entities/board-automation.entity.js';
import type { BoardSubscriptionEntity } from './entities/board-subscription.entity.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { BoardId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

export type BoardScope = 'platform' | 'organization';

export type CloseTrigger = {
  type: 'on-moderation-resolved';
  addComment: boolean;
};

export type BoardState = EntityState<{
  boardId: BoardId;
  name: string;
  description: string | null;
  scope: BoardScope;
  organizationId: OrganizationId | null;
  subscriptions: BoardSubscriptionEntity[];
  manualCreation: boolean;
  allowedTransferBoardIds: BoardId[];
  memberIds: UserId[];
  automations: BoardAutomationEntity[];
  closeTrigger: CloseTrigger | null;
  createdAt: Date;
  updatedAt: Date;
}>;

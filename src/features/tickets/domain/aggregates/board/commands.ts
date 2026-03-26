import type { SubscriptionFilter } from '../../vo/filters.js';
import type { TriggerId } from '../../vo/triggers.js';
import type { BoardScope, CloseTrigger } from './state.js';
import type {
  BoardAutomationId,
  BoardId,
  BoardSubscriptionId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

export type CreateBoardCommand = {
  type: 'CreateBoard';
  boardId: BoardId;
  name: string;
  description: string | null;
  scope: BoardScope;
  organizationId: OrganizationId | null;
  manualCreation: boolean;
  now: Date;
};

export type UpdateBoardCommand = {
  type: 'UpdateBoard';
  name: string;
  description: string | null;
  manualCreation: boolean;
  allowedTransferBoardIds: BoardId[];
  closeTrigger: CloseTrigger | null;
  now: Date;
};

export type AddSubscriptionCommand = {
  type: 'AddSubscription';
  subscriptionId: BoardSubscriptionId;
  triggerId: TriggerId;
  filters: SubscriptionFilter[];
  now: Date;
};

export type RemoveSubscriptionCommand = {
  type: 'RemoveSubscription';
  subscriptionId: BoardSubscriptionId;
  now: Date;
};

export type AddMemberCommand = {
  type: 'AddMember';
  userId: UserId;
  now: Date;
};

export type RemoveMemberCommand = {
  type: 'RemoveMember';
  userId: UserId;
  now: Date;
};

export type AddAutomationCommand = {
  type: 'AddAutomation';
  automationId: BoardAutomationId;
  agentId: string;
  systemPrompt: string;
  onUncertainMoveToBoardId: BoardId | null;
  now: Date;
};

export type RemoveAutomationCommand = {
  type: 'RemoveAutomation';
  automationId: BoardAutomationId;
  now: Date;
};

export type BoardCommand =
  | CreateBoardCommand
  | UpdateBoardCommand
  | AddSubscriptionCommand
  | RemoveSubscriptionCommand
  | AddMemberCommand
  | RemoveMemberCommand
  | AddAutomationCommand
  | RemoveAutomationCommand;

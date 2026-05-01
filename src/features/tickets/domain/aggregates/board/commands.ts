import type { SubscriptionFilter } from '../../vo/filters.js';
import type { TriggerId } from '../../vo/triggers.js';
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

export type AddCloseSubscriptionCommand = {
  type: 'AddCloseSubscription';
  subscriptionId: BoardCloseSubscriptionId;
  triggerId: TriggerId;
  filters: SubscriptionFilter[];
  addComment: boolean;
  now: Date;
};

export type RemoveCloseSubscriptionCommand = {
  type: 'RemoveCloseSubscription';
  subscriptionId: BoardCloseSubscriptionId;
  now: Date;
};

export type AddRedirectSubscriptionCommand = {
  type: 'AddRedirectSubscription';
  subscriptionId: BoardRedirectSubscriptionId;
  triggerId: TriggerId;
  filters: SubscriptionFilter[];
  targetBoardId: BoardId;
  addComment: boolean;
  commentTemplate: string;
  now: Date;
};

export type RemoveRedirectSubscriptionCommand = {
  type: 'RemoveRedirectSubscription';
  subscriptionId: BoardRedirectSubscriptionId;
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
  | AddCloseSubscriptionCommand
  | RemoveCloseSubscriptionCommand
  | AddRedirectSubscriptionCommand
  | RemoveRedirectSubscriptionCommand
  | AddMemberCommand
  | RemoveMemberCommand
  | AddAutomationCommand
  | RemoveAutomationCommand;

import type { OrganizationPermission, SubscriptionPlanId } from './config.js';
import type { EmployeeRoleId, FileId, OrganizationId, UserId } from '@/kernel/domain/ids.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

// --- Lifecycle ---

export type OrganizationCreatedEvent = {
  type: 'organization.created';
  id: OrganizationId;
  creatorUserId: UserId;
  name: string;
  description: string;
  avatarId: FileId | null;
  adminRoleId: EmployeeRoleId;
  createdAt: Date;
};

// --- Info ---

export type InfoDraftUpdatedEvent = {
  type: 'organization.info-draft-updated';
  name: string;
  description: string;
  avatarId: FileId | null;
  updatedAt: Date;
};

export type InfoSubmittedForModerationEvent = {
  type: 'organization.info-submitted-for-moderation';
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: FileId | null;
  submittedAt: Date;
};

export type InfoModerationApprovedEvent = {
  type: 'organization.info-moderation-approved';
  eventId: string;
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: FileId | null;
  publishedAt: Date;
};

export type InfoModerationRejectedEvent = {
  type: 'organization.info-moderation-rejected';
  rejectedAt: Date;
};

// --- Employees ---

export type EmployeeInvitedEvent = {
  type: 'organization.employee-invited';
  userId: UserId;
  roleId: EmployeeRoleId;
  joinedAt: Date;
};

export type EmployeeRemovedEvent = {
  type: 'organization.employee-removed';
  userId: UserId;
  removedAt: Date;
};

export type EmployeeRoleChangedEvent = {
  type: 'organization.employee-role-changed';
  userId: UserId;
  roleId: EmployeeRoleId;
  updatedAt: Date;
};

export type OwnershipTransferredEvent = {
  type: 'organization.ownership-transferred';
  fromUserId: UserId;
  toUserId: UserId;
  updatedAt: Date;
};

// --- Roles ---

export type EmployeeRoleCreatedEvent = {
  type: 'organization.role-created';
  id: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
  createdAt: Date;
};

export type EmployeeRoleUpdatedEvent = {
  type: 'organization.role-updated';
  roleId: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
  updatedAt: Date;
};

export type EmployeeRoleDeletedEvent = {
  type: 'organization.role-deleted';
  roleId: EmployeeRoleId;
  replacementRoleId: EmployeeRoleId;
  deletedAt: Date;
};

// --- Subscription ---

export type SubscriptionChangedEvent = {
  type: 'organization.subscription-changed';
  planId: SubscriptionPlanId;
  maxEmployees: number;
  maxPublishedItems: number;
  availableWidgetTypes: WidgetType[];
  updatedAt: Date;
};

export type DowngradedToFreeEvent = {
  type: 'organization.downgraded-to-free';
  blockedEmployeeIds: UserId[];
  downgradedAt: Date;
};

// --- Union ---

export type OrganizationEvent =
  | OrganizationCreatedEvent
  | InfoDraftUpdatedEvent
  | InfoSubmittedForModerationEvent
  | InfoModerationApprovedEvent
  | InfoModerationRejectedEvent
  | EmployeeInvitedEvent
  | EmployeeRemovedEvent
  | EmployeeRoleChangedEvent
  | OwnershipTransferredEvent
  | EmployeeRoleCreatedEvent
  | EmployeeRoleUpdatedEvent
  | EmployeeRoleDeletedEvent
  | SubscriptionChangedEvent
  | DowngradedToFreeEvent;

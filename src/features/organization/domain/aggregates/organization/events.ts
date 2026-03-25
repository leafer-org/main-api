import type { OrganizationPermission, SubscriptionPlanId } from './config.js';
import type { EmployeeRoleId, MediaId, OrganizationId, UserId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import type { ContactLink, OrgTeam, WidgetType } from '@/kernel/domain/vo/widget.js';

// --- Lifecycle ---

export type OrganizationCreatedEvent = {
  type: 'organization.created';
  id: OrganizationId;
  creatorUserId: UserId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  team: OrgTeam;
  adminRoleId: EmployeeRoleId;
  createdAt: Date;
};

export type OrganizationAdminCreatedEvent = {
  type: 'organization.admin-created';
  id: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  team: OrgTeam;
  adminRoleId: EmployeeRoleId;
  claimToken: string;
  createdAt: Date;
};

export type OrganizationClaimedEvent = {
  type: 'organization.claimed';
  userId: UserId;
  claimedAt: Date;
};

export type ClaimTokenRegeneratedEvent = {
  type: 'organization.claim-token-regenerated';
  newToken: string;
  regeneratedAt: Date;
};

// --- Info ---

export type InfoDraftUpdatedEvent = {
  type: 'organization.info-draft-updated';
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  team: OrgTeam;
  updatedAt: Date;
};

export type InfoDraftChangesDiscardedEvent = {
  type: 'organization.info-draft-changes-discarded';
  discardedAt: Date;
};

export type InfoSubmittedForModerationEvent = {
  type: 'organization.info-submitted-for-moderation';
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  team: OrgTeam;
  submittedAt: Date;
};

export type InfoModerationApprovedEvent = {
  type: 'organization.info-moderation-approved';
  eventId: string;
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  team: OrgTeam;
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

export type InfoUnpublishedEvent = {
  type: 'organization.info-unpublished';
  organizationId: OrganizationId;
  unpublishedAt: Date;
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
  | OrganizationAdminCreatedEvent
  | OrganizationClaimedEvent
  | ClaimTokenRegeneratedEvent
  | InfoDraftUpdatedEvent
  | InfoDraftChangesDiscardedEvent
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
  | InfoUnpublishedEvent
  | SubscriptionChangedEvent
  | DowngradedToFreeEvent;

import type { OrganizationPermission, SubscriptionPlanId } from './config.js';
import type { EmployeeRoleId, MediaId, OrganizationId, UserId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

// --- Lifecycle ---

export type CreateOrganizationCommand = {
  type: 'CreateOrganization';
  id: OrganizationId;
  creatorUserId: UserId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  adminRoleId: EmployeeRoleId;
  now: Date;
};

// --- Info ---

export type UpdateInfoDraftCommand = {
  type: 'UpdateInfoDraft';
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  now: Date;
};

export type SubmitInfoForModerationCommand = {
  type: 'SubmitInfoForModeration';
  now: Date;
};

export type ApproveInfoModerationCommand = {
  type: 'ApproveInfoModeration';
  eventId: string;
  now: Date;
};

export type RejectInfoModerationCommand = {
  type: 'RejectInfoModeration';
  now: Date;
};

// --- Employees ---

export type InviteEmployeeCommand = {
  type: 'InviteEmployee';
  userId: UserId;
  roleId: EmployeeRoleId;
  now: Date;
};

export type RemoveEmployeeCommand = {
  type: 'RemoveEmployee';
  userId: UserId;
  now: Date;
};

export type ChangeEmployeeRoleCommand = {
  type: 'ChangeEmployeeRole';
  userId: UserId;
  roleId: EmployeeRoleId;
  now: Date;
};

export type TransferOwnershipCommand = {
  type: 'TransferOwnership';
  fromUserId: UserId;
  toUserId: UserId;
  now: Date;
};

// --- Roles ---

export type CreateEmployeeRoleCommand = {
  type: 'CreateEmployeeRole';
  id: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
  now: Date;
};

export type UpdateEmployeeRoleCommand = {
  type: 'UpdateEmployeeRole';
  roleId: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
  now: Date;
};

export type DeleteEmployeeRoleCommand = {
  type: 'DeleteEmployeeRole';
  roleId: EmployeeRoleId;
  replacementRoleId: EmployeeRoleId;
  now: Date;
};

// --- Admin Lifecycle ---

export type AdminCreateOrganizationCommand = {
  type: 'AdminCreateOrganization';
  id: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  adminRoleId: EmployeeRoleId;
  claimToken: string;
  now: Date;
};

export type ClaimOrganizationCommand = {
  type: 'ClaimOrganization';
  claimToken: string;
  userId: UserId;
  now: Date;
};

export type RegenerateClaimTokenCommand = {
  type: 'RegenerateClaimToken';
  newToken: string;
  now: Date;
};

export type UnpublishOrganizationCommand = {
  type: 'UnpublishOrganization';
  now: Date;
};

// --- Subscription ---

export type ChangeSubscriptionCommand = {
  type: 'ChangeSubscription';
  planId: SubscriptionPlanId;
  now: Date;
};

export type DowngradeToFreeCommand = {
  type: 'DowngradeToFree';
  now: Date;
};

// --- Union ---

export type OrganizationCommand =
  | CreateOrganizationCommand
  | AdminCreateOrganizationCommand
  | ClaimOrganizationCommand
  | RegenerateClaimTokenCommand
  | UpdateInfoDraftCommand
  | SubmitInfoForModerationCommand
  | ApproveInfoModerationCommand
  | RejectInfoModerationCommand
  | InviteEmployeeCommand
  | RemoveEmployeeCommand
  | ChangeEmployeeRoleCommand
  | TransferOwnershipCommand
  | CreateEmployeeRoleCommand
  | UpdateEmployeeRoleCommand
  | DeleteEmployeeRoleCommand
  | UnpublishOrganizationCommand
  | ChangeSubscriptionCommand
  | DowngradeToFreeCommand;

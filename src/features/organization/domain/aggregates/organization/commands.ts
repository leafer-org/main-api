import type { OrganizationPermission, SubscriptionPlanId } from './config.js';
import type { EmployeeRoleId, FileId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

// --- Lifecycle ---

export type CreateOrganizationCommand = {
  type: 'CreateOrganization';
  id: OrganizationId;
  creatorUserId: UserId;
  name: string;
  description: string;
  avatarId: FileId | null;
  adminRoleId: EmployeeRoleId;
  now: Date;
};

// --- Info ---

export type UpdateInfoDraftCommand = {
  type: 'UpdateInfoDraft';
  name: string;
  description: string;
  avatarId: FileId | null;
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
  | ChangeSubscriptionCommand
  | DowngradeToFreeCommand;

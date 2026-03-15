import type {
  AdminCreateOrganizationCommand,
  ApproveInfoModerationCommand,
  ChangeEmployeeRoleCommand,
  ChangeSubscriptionCommand,
  ClaimOrganizationCommand,
  CreateEmployeeRoleCommand,
  CreateOrganizationCommand,
  DeleteEmployeeRoleCommand,
  DowngradeToFreeCommand,
  InviteEmployeeCommand,
  RegenerateClaimTokenCommand,
  RejectInfoModerationCommand,
  RemoveEmployeeCommand,
  SubmitInfoForModerationCommand,
  TransferOwnershipCommand,
  UnpublishOrganizationCommand,
  UpdateEmployeeRoleCommand,
  UpdateInfoDraftCommand,
} from './commands.js';
import { ADMIN_ROLE_NAME, ALL_PERMISSIONS } from './config.js';
import { EmployeeEntity } from './entities/employee.entity.js';
import { EmployeeRoleEntity } from './entities/employee-role.entity.js';
import { InfoDraftEntity } from './entities/info-draft.entity.js';
import { InfoPublicationEntity } from './entities/info-publication.entity.js';
import { SubscriptionEntity } from './entities/subscription.entity.js';
import {
  InvalidClaimTokenError,
  OrganizationAlreadyClaimedError,
  RoleNotFoundError,
  type CannotDeleteAdminRoleError,
  type CannotRemoveOwnerError,
  type EmployeeAlreadyExistsError,
  type EmployeeLimitReachedError,
  type EmployeeNotFoundError,
  type InfoNotInDraftError,
  type InfoNotInModerationError,
  InfoNotPublishedError,
  type TransferTargetNotEmployeeError,
} from './errors.js';
import type {
  ClaimTokenRegeneratedEvent,
  DowngradedToFreeEvent,
  EmployeeInvitedEvent,
  EmployeeRemovedEvent,
  EmployeeRoleChangedEvent,
  EmployeeRoleCreatedEvent,
  EmployeeRoleDeletedEvent,
  EmployeeRoleUpdatedEvent,
  InfoDraftUpdatedEvent,
  InfoModerationApprovedEvent,
  InfoModerationRejectedEvent,
  InfoSubmittedForModerationEvent,
  InfoUnpublishedEvent,
  OrganizationAdminCreatedEvent,
  OrganizationClaimedEvent,
  OrganizationCreatedEvent,
  OwnershipTransferredEvent,
  SubscriptionChangedEvent,
} from './events.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

// --- Re-export sub-entity types ---

export type { EmployeeEntity } from './entities/employee.entity.js';
export type { EmployeeRoleEntity } from './entities/employee-role.entity.js';
export type { InfoDraftEntity } from './entities/info-draft.entity.js';
export type { InfoPublicationEntity } from './entities/info-publication.entity.js';
export type { SubscriptionEntity } from './entities/subscription.entity.js';

// --- Aggregate State ---

export type OrganizationEntity = EntityState<{
  id: OrganizationId;

  infoDraft: InfoDraftEntity;
  infoPublication: InfoPublicationEntity | null;

  employees: EmployeeEntity[];
  roles: EmployeeRoleEntity[];

  subscription: SubscriptionEntity;

  claimToken: string | null;

  createdAt: Date;
  updatedAt: Date;
}>;

// --- Aggregate ---

export const OrganizationEntity = {
  create(
    cmd: CreateOrganizationCommand,
  ): Either<never, { state: OrganizationEntity; event: OrganizationCreatedEvent }> {
    const event: OrganizationCreatedEvent = {
      type: 'organization.created',
      id: cmd.id,
      creatorUserId: cmd.creatorUserId,
      name: cmd.name,
      description: cmd.description,
      avatarId: cmd.avatarId,
      adminRoleId: cmd.adminRoleId,
      createdAt: cmd.now,
    };

    const state: OrganizationEntity = {
      id: event.id,
      infoDraft: InfoDraftEntity.create(event.name, event.description, event.avatarId),
      infoPublication: null,
      employees: [
        EmployeeEntity.createOwner(event.creatorUserId, event.adminRoleId, event.createdAt),
      ],
      roles: [
        EmployeeRoleEntity.createOne(event.adminRoleId, ADMIN_ROLE_NAME, [...ALL_PERMISSIONS]),
      ],
      subscription: SubscriptionEntity.fromPlan('free'),
      claimToken: null,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    };

    return Right({ state, event });
  },

  adminCreate(
    cmd: AdminCreateOrganizationCommand,
  ): Either<never, { state: OrganizationEntity; event: OrganizationAdminCreatedEvent }> {
    const event: OrganizationAdminCreatedEvent = {
      type: 'organization.admin-created',
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
      avatarId: cmd.avatarId,
      adminRoleId: cmd.adminRoleId,
      claimToken: cmd.claimToken,
      createdAt: cmd.now,
    };

    const state: OrganizationEntity = {
      id: event.id,
      infoDraft: InfoDraftEntity.create(event.name, event.description, event.avatarId),
      infoPublication: null,
      employees: [],
      roles: [
        EmployeeRoleEntity.createOne(event.adminRoleId, ADMIN_ROLE_NAME, [...ALL_PERMISSIONS]),
      ],
      subscription: SubscriptionEntity.fromPlan('free'),
      claimToken: event.claimToken,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    };

    return Right({ state, event });
  },

  claim(
    state: OrganizationEntity,
    cmd: ClaimOrganizationCommand,
  ): Either<
    OrganizationAlreadyClaimedError | InvalidClaimTokenError,
    { state: OrganizationEntity; event: OrganizationClaimedEvent }
  > {
    if (state.claimToken === null) {
      return Left(new OrganizationAlreadyClaimedError());
    }
    if (state.claimToken !== cmd.claimToken) {
      return Left(new InvalidClaimTokenError());
    }

    const event: OrganizationClaimedEvent = {
      type: 'organization.claimed',
      userId: cmd.userId,
      claimedAt: cmd.now,
    };

    const adminRole = EmployeeRoleEntity.findAdmin(state.roles);

    return Right({
      state: {
        ...state,
        claimToken: null,
        employees: [EmployeeEntity.createOwner(cmd.userId, adminRole.id, cmd.now)],
        updatedAt: cmd.now,
      },
      event,
    });
  },

  regenerateClaimToken(
    state: OrganizationEntity,
    cmd: RegenerateClaimTokenCommand,
  ): Either<
    OrganizationAlreadyClaimedError,
    { state: OrganizationEntity; event: ClaimTokenRegeneratedEvent }
  > {
    if (state.claimToken === null) {
      return Left(new OrganizationAlreadyClaimedError());
    }

    const event: ClaimTokenRegeneratedEvent = {
      type: 'organization.claim-token-regenerated',
      newToken: cmd.newToken,
      regeneratedAt: cmd.now,
    };

    return Right({
      state: { ...state, claimToken: cmd.newToken, updatedAt: cmd.now },
      event,
    });
  },

  updateInfoDraft(
    state: OrganizationEntity,
    cmd: UpdateInfoDraftCommand,
  ): Either<never, { state: OrganizationEntity; event: InfoDraftUpdatedEvent }> {
    const newDraft = InfoDraftEntity.update(
      state.infoDraft,
      cmd.name,
      cmd.description,
      cmd.avatarId,
    );

    const event: InfoDraftUpdatedEvent = {
      type: 'organization.info-draft-updated',
      name: cmd.name,
      description: cmd.description,
      avatarId: cmd.avatarId,
      updatedAt: cmd.now,
    };

    return Right({ state: { ...state, infoDraft: newDraft, updatedAt: cmd.now }, event });
  },

  submitInfoForModeration(
    state: OrganizationEntity,
    cmd: SubmitInfoForModerationCommand,
  ): Either<
    InfoNotInDraftError,
    { state: OrganizationEntity; event: InfoSubmittedForModerationEvent }
  > {
    const result = InfoDraftEntity.submitForModeration(state.infoDraft);
    if (isLeft(result)) return result;

    const event: InfoSubmittedForModerationEvent = {
      type: 'organization.info-submitted-for-moderation',
      organizationId: state.id,
      name: state.infoDraft.name,
      description: state.infoDraft.description,
      avatarId: state.infoDraft.avatarId,
      submittedAt: cmd.now,
    };

    return Right({ state: { ...state, infoDraft: result.value, updatedAt: cmd.now }, event });
  },

  approveInfoModeration(
    state: OrganizationEntity,
    cmd: ApproveInfoModerationCommand,
  ): Either<
    InfoNotInModerationError,
    { state: OrganizationEntity; event: InfoModerationApprovedEvent }
  > {
    const result = InfoDraftEntity.approve(state.infoDraft);
    if (isLeft(result)) return result;

    const publication = InfoPublicationEntity.createFromDraft(state.infoDraft, cmd.now);

    const event: InfoModerationApprovedEvent = {
      type: 'organization.info-moderation-approved',
      eventId: cmd.eventId,
      organizationId: state.id,
      name: state.infoDraft.name,
      description: state.infoDraft.description,
      avatarId: state.infoDraft.avatarId,
      publishedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        infoDraft: result.value,
        infoPublication: publication,
        updatedAt: cmd.now,
      },
      event,
    });
  },

  rejectInfoModeration(
    state: OrganizationEntity,
    cmd: RejectInfoModerationCommand,
  ): Either<
    InfoNotInModerationError,
    { state: OrganizationEntity; event: InfoModerationRejectedEvent }
  > {
    const result = InfoDraftEntity.reject(state.infoDraft);
    if (isLeft(result)) return result;

    const event: InfoModerationRejectedEvent = {
      type: 'organization.info-moderation-rejected',
      rejectedAt: cmd.now,
    };

    return Right({ state: { ...state, infoDraft: result.value, updatedAt: cmd.now }, event });
  },

  inviteEmployee(
    state: OrganizationEntity,
    cmd: InviteEmployeeCommand,
  ): Either<
    EmployeeAlreadyExistsError | EmployeeLimitReachedError | RoleNotFoundError,
    { state: OrganizationEntity; event: EmployeeInvitedEvent }
  > {
    if (!EmployeeRoleEntity.exists(state.roles, cmd.roleId)) {
      return Left(new RoleNotFoundError());
    }

    const result = EmployeeEntity.invite(
      state.employees,
      cmd.userId,
      cmd.roleId,
      state.subscription.maxEmployees,
      cmd.now,
    );
    if (isLeft(result)) return result;

    const event: EmployeeInvitedEvent = {
      type: 'organization.employee-invited',
      userId: cmd.userId,
      roleId: cmd.roleId,
      joinedAt: cmd.now,
    };

    return Right({ state: { ...state, employees: result.value, updatedAt: cmd.now }, event });
  },

  removeEmployee(
    state: OrganizationEntity,
    cmd: RemoveEmployeeCommand,
  ): Either<
    EmployeeNotFoundError | CannotRemoveOwnerError,
    { state: OrganizationEntity; event: EmployeeRemovedEvent }
  > {
    const result = EmployeeEntity.remove(state.employees, cmd.userId);
    if (isLeft(result)) return result;

    const event: EmployeeRemovedEvent = {
      type: 'organization.employee-removed',
      userId: cmd.userId,
      removedAt: cmd.now,
    };

    return Right({ state: { ...state, employees: result.value, updatedAt: cmd.now }, event });
  },

  changeEmployeeRole(
    state: OrganizationEntity,
    cmd: ChangeEmployeeRoleCommand,
  ): Either<
    EmployeeNotFoundError | RoleNotFoundError,
    { state: OrganizationEntity; event: EmployeeRoleChangedEvent }
  > {
    if (!EmployeeRoleEntity.exists(state.roles, cmd.roleId)) {
      return Left(new RoleNotFoundError());
    }

    const result = EmployeeEntity.changeRole(state.employees, cmd.userId, cmd.roleId);
    if (isLeft(result)) return result;

    const event: EmployeeRoleChangedEvent = {
      type: 'organization.employee-role-changed',
      userId: cmd.userId,
      roleId: cmd.roleId,
      updatedAt: cmd.now,
    };

    return Right({ state: { ...state, employees: result.value, updatedAt: cmd.now }, event });
  },

  transferOwnership(
    state: OrganizationEntity,
    cmd: TransferOwnershipCommand,
  ): Either<
    EmployeeNotFoundError | TransferTargetNotEmployeeError,
    { state: OrganizationEntity; event: OwnershipTransferredEvent }
  > {
    const adminRole = EmployeeRoleEntity.findAdmin(state.roles);
    const result = EmployeeEntity.transferOwnership(
      state.employees,
      cmd.fromUserId,
      cmd.toUserId,
      adminRole.id,
    );
    if (isLeft(result)) return result;

    const event: OwnershipTransferredEvent = {
      type: 'organization.ownership-transferred',
      fromUserId: cmd.fromUserId,
      toUserId: cmd.toUserId,
      updatedAt: cmd.now,
    };

    return Right({ state: { ...state, employees: result.value, updatedAt: cmd.now }, event });
  },

  createEmployeeRole(
    state: OrganizationEntity,
    cmd: CreateEmployeeRoleCommand,
  ): Either<never, { state: OrganizationEntity; event: EmployeeRoleCreatedEvent }> {
    const newRoles = EmployeeRoleEntity.create(state.roles, cmd.id, cmd.name, cmd.permissions);

    const event: EmployeeRoleCreatedEvent = {
      type: 'organization.role-created',
      id: cmd.id,
      name: cmd.name,
      permissions: cmd.permissions,
      createdAt: cmd.now,
    };

    return Right({ state: { ...state, roles: newRoles, updatedAt: cmd.now }, event });
  },

  updateEmployeeRole(
    state: OrganizationEntity,
    cmd: UpdateEmployeeRoleCommand,
  ): Either<RoleNotFoundError, { state: OrganizationEntity; event: EmployeeRoleUpdatedEvent }> {
    const result = EmployeeRoleEntity.update(state.roles, cmd.roleId, cmd.name, cmd.permissions);
    if (isLeft(result)) return result;

    const event: EmployeeRoleUpdatedEvent = {
      type: 'organization.role-updated',
      roleId: cmd.roleId,
      name: cmd.name,
      permissions: cmd.permissions,
      updatedAt: cmd.now,
    };

    return Right({ state: { ...state, roles: result.value, updatedAt: cmd.now }, event });
  },

  deleteEmployeeRole(
    state: OrganizationEntity,
    cmd: DeleteEmployeeRoleCommand,
  ): Either<
    RoleNotFoundError | CannotDeleteAdminRoleError,
    { state: OrganizationEntity; event: EmployeeRoleDeletedEvent }
  > {
    const result = EmployeeRoleEntity.delete(
      state.roles,
      state.employees,
      cmd.roleId,
      cmd.replacementRoleId,
    );
    if (isLeft(result)) return result;

    const event: EmployeeRoleDeletedEvent = {
      type: 'organization.role-deleted',
      roleId: cmd.roleId,
      replacementRoleId: cmd.replacementRoleId,
      deletedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        roles: result.value.roles,
        employees: result.value.employees,
        updatedAt: cmd.now,
      },
      event,
    });
  },

  changeSubscription(
    state: OrganizationEntity,
    cmd: ChangeSubscriptionCommand,
  ): Either<never, { state: OrganizationEntity; event: SubscriptionChangedEvent }> {
    const newSub = SubscriptionEntity.change(cmd.planId);

    const event: SubscriptionChangedEvent = {
      type: 'organization.subscription-changed',
      planId: newSub.planId,
      maxEmployees: newSub.maxEmployees,
      maxPublishedItems: newSub.maxPublishedItems,
      availableWidgetTypes: newSub.availableWidgetTypes,
      updatedAt: cmd.now,
    };

    return Right({ state: { ...state, subscription: newSub, updatedAt: cmd.now }, event });
  },

  unpublishInfo(
    state: OrganizationEntity,
    cmd: UnpublishOrganizationCommand,
  ): Either<InfoNotPublishedError, { state: OrganizationEntity; event: InfoUnpublishedEvent }> {
    if (!state.infoPublication) return Left(new InfoNotPublishedError());

    const event: InfoUnpublishedEvent = {
      type: 'organization.info-unpublished',
      organizationId: state.id,
      unpublishedAt: cmd.now,
    };

    return Right({
      state: { ...state, infoPublication: null, updatedAt: cmd.now },
      event,
    });
  },

  downgradeToFree(
    state: OrganizationEntity,
    cmd: DowngradeToFreeCommand,
  ): Either<never, { state: OrganizationEntity; event: DowngradedToFreeEvent }> {
    const newSub = SubscriptionEntity.fromPlan('free');
    const { kept, blockedIds } = EmployeeEntity.blockExcess(state.employees, newSub.maxEmployees);

    const event: DowngradedToFreeEvent = {
      type: 'organization.downgraded-to-free',
      blockedEmployeeIds: blockedIds,
      downgradedAt: cmd.now,
    };

    return Right({
      state: { ...state, employees: kept, subscription: newSub, updatedAt: cmd.now },
      event,
    });
  },
};

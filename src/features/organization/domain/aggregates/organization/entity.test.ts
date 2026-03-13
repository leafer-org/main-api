import { describe, expect, it } from 'vitest';

import { ADMIN_ROLE_NAME, ALL_PERMISSIONS, SUBSCRIPTION_PLANS } from './config.js';
import { OrganizationEntity } from './entity.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { EmployeeRoleId, FileId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ORG_ID = OrganizationId.raw('org-1');
const CREATOR_ID = UserId.raw('user-creator');
const USER_2 = UserId.raw('user-2');
const USER_3 = UserId.raw('user-3');
const ADMIN_ROLE_ID = EmployeeRoleId.raw('role-admin');
const ROLE_2_ID = EmployeeRoleId.raw('role-2');
const ROLE_3_ID = EmployeeRoleId.raw('role-3');
const AVATAR_ID = FileId.raw('avatar-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

function createOrg() {
  const result = OrganizationEntity.create({
    type: 'CreateOrganization',
    id: ORG_ID,
    creatorUserId: CREATOR_ID,
    name: 'Test Org',
    description: 'A test organization',
    avatarId: null,
    adminRoleId: ADMIN_ROLE_ID,
    now: NOW,
  });
  if (isLeft(result)) throw new Error('Expected Right');
  return result.value.state;
}

function orgWithRole2() {
  const state = createOrg();
  const result = OrganizationEntity.createEmployeeRole(state, {
    type: 'CreateEmployeeRole',
    id: ROLE_2_ID,
    name: 'Editor',
    permissions: ['edit_items'],
    now: NOW,
  });
  if (isLeft(result)) throw new Error('Expected Right');
  return result.value.state;
}

function orgWithTeamPlanAndEmployee() {
  let state = createOrg();
  // Upgrade to team plan
  const sub = OrganizationEntity.changeSubscription(state, {
    type: 'ChangeSubscription',
    planId: 'team',
    now: NOW,
  });
  if (isLeft(sub)) throw new Error('Expected Right');
  state = sub.value.state;

  // Add role
  const role = OrganizationEntity.createEmployeeRole(state, {
    type: 'CreateEmployeeRole',
    id: ROLE_2_ID,
    name: 'Editor',
    permissions: ['edit_items'],
    now: NOW,
  });
  if (isLeft(role)) throw new Error('Expected Right');
  state = role.value.state;

  // Invite employee
  const inv = OrganizationEntity.inviteEmployee(state, {
    type: 'InviteEmployee',
    userId: USER_2,
    roleId: ROLE_2_ID,
    now: NOW,
  });
  if (isLeft(inv)) throw new Error('Expected Right');
  return inv.value.state;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OrganizationEntity', () => {
  describe('create', () => {
    it('creates organization with admin role and owner', () => {
      const result = OrganizationEntity.create({
        type: 'CreateOrganization',
        id: ORG_ID,
        creatorUserId: CREATOR_ID,
        name: 'Test Org',
        description: 'Desc',
        avatarId: AVATAR_ID,
        adminRoleId: ADMIN_ROLE_ID,
        now: NOW,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      const { state, event } = result.value;

      expect(event.type).toBe('organization.created');
      expect(event.id).toBe(ORG_ID);
      expect(event.creatorUserId).toBe(CREATOR_ID);

      expect(state.roles).toHaveLength(1);
      expect(state.roles[0]!.name).toBe(ADMIN_ROLE_NAME);
      expect(state.roles[0]!.permissions).toEqual(ALL_PERMISSIONS);

      expect(state.employees).toHaveLength(1);
      expect(state.employees[0]!.userId).toBe(CREATOR_ID);
      expect(state.employees[0]!.isOwner).toBe(true);
      expect(state.employees[0]!.roleId).toBe(ADMIN_ROLE_ID);

      expect(state.subscription.planId).toBe('free');
      expect(state.infoDraft.status).toBe('draft');
      expect(state.infoPublication).toBeNull();
    });
  });

  describe('updateInfoDraft', () => {
    it('updates draft info and resets status to draft', () => {
      const state = createOrg();
      const result = OrganizationEntity.updateInfoDraft(state, {
        type: 'UpdateInfoDraft',
        name: 'New Name',
        description: 'New Desc',
        avatarId: AVATAR_ID,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.infoDraft.name).toBe('New Name');
      expect(result.value.state.infoDraft.avatarId).toBe(AVATAR_ID);
      expect(result.value.state.infoDraft.status).toBe('draft');
      expect(result.value.event.type).toBe('organization.info-draft-updated');
    });
  });

  describe('submitInfoForModeration', () => {
    it('submits from draft status', () => {
      const state = createOrg();
      const result = OrganizationEntity.submitInfoForModeration(state, {
        type: 'SubmitInfoForModeration',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.infoDraft.status).toBe('moderation-request');
      expect(result.value.event.type).toBe('organization.info-submitted-for-moderation');
    });

    it('submits from rejected status', () => {
      let state = createOrg();
      // Submit → reject → submit again
      const r = OrganizationEntity.submitInfoForModeration(state, {
        type: 'SubmitInfoForModeration',
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      const r2 = OrganizationEntity.rejectInfoModeration(state, {
        type: 'RejectInfoModeration',
        now: NOW,
      });
      if (isLeft(r2)) throw new Error('Expected Right');
      state = r2.value.state;

      const result = OrganizationEntity.submitInfoForModeration(state, {
        type: 'SubmitInfoForModeration',
        now: LATER,
      });
      expect(isLeft(result)).toBe(false);
    });

    it('returns InfoNotInDraftError if already in moderation', () => {
      let state = createOrg();
      const r = OrganizationEntity.submitInfoForModeration(state, {
        type: 'SubmitInfoForModeration',
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      const result = OrganizationEntity.submitInfoForModeration(state, {
        type: 'SubmitInfoForModeration',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('info_not_in_draft');
      }
    });
  });

  describe('approveInfoModeration', () => {
    it('creates infoPublication from draft', () => {
      let state = createOrg();
      const r = OrganizationEntity.submitInfoForModeration(state, {
        type: 'SubmitInfoForModeration',
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      const result = OrganizationEntity.approveInfoModeration(state, {
        type: 'ApproveInfoModeration',
        eventId: 'evt-1',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.infoPublication).not.toBeNull();
      expect(result.value.state.infoPublication!.name).toBe('Test Org');
      expect(result.value.state.infoDraft.status).toBe('draft');
      expect(result.value.event.type).toBe('organization.info-moderation-approved');
    });

    it('returns InfoNotInModerationError if not in moderation', () => {
      const state = createOrg();
      const result = OrganizationEntity.approveInfoModeration(state, {
        type: 'ApproveInfoModeration',
        eventId: 'evt-1',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('info_not_in_moderation');
      }
    });
  });

  describe('rejectInfoModeration', () => {
    it('sets status to rejected', () => {
      let state = createOrg();
      const r = OrganizationEntity.submitInfoForModeration(state, {
        type: 'SubmitInfoForModeration',
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      const result = OrganizationEntity.rejectInfoModeration(state, {
        type: 'RejectInfoModeration',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      expect(result.value.state.infoDraft.status).toBe('rejected');
    });

    it('returns InfoNotInModerationError if not in moderation', () => {
      const state = createOrg();
      const result = OrganizationEntity.rejectInfoModeration(state, {
        type: 'RejectInfoModeration',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('info_not_in_moderation');
      }
    });
  });

  describe('inviteEmployee', () => {
    it('adds employee to organization', () => {
      const state = orgWithTeamPlanAndEmployee();
      expect(state.employees).toHaveLength(2);
      expect(state.employees[1]!.userId).toBe(USER_2);
      expect(state.employees[1]!.isOwner).toBe(false);
    });

    it('returns EmployeeAlreadyExistsError for duplicate', () => {
      const state = orgWithTeamPlanAndEmployee();
      const result = OrganizationEntity.inviteEmployee(state, {
        type: 'InviteEmployee',
        userId: USER_2,
        roleId: ROLE_2_ID,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('employee_already_exists');
      }
    });

    it('returns EmployeeLimitReachedError on free plan', () => {
      const state = orgWithRole2();
      const result = OrganizationEntity.inviteEmployee(state, {
        type: 'InviteEmployee',
        userId: USER_2,
        roleId: ROLE_2_ID,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('employee_limit_reached');
      }
    });

    it('returns RoleNotFoundError for unknown role', () => {
      let state = createOrg();
      const sub = OrganizationEntity.changeSubscription(state, {
        type: 'ChangeSubscription',
        planId: 'team',
        now: NOW,
      });
      if (isLeft(sub)) throw new Error('Expected Right');
      state = sub.value.state;

      const result = OrganizationEntity.inviteEmployee(state, {
        type: 'InviteEmployee',
        userId: USER_2,
        roleId: EmployeeRoleId.raw('nonexistent'),
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('role_not_found');
      }
    });
  });

  describe('removeEmployee', () => {
    it('removes non-owner employee', () => {
      const state = orgWithTeamPlanAndEmployee();
      const result = OrganizationEntity.removeEmployee(state, {
        type: 'RemoveEmployee',
        userId: USER_2,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      expect(result.value.state.employees).toHaveLength(1);
      expect(result.value.event.type).toBe('organization.employee-removed');
    });

    it('returns CannotRemoveOwnerError for owner', () => {
      const state = createOrg();
      const result = OrganizationEntity.removeEmployee(state, {
        type: 'RemoveEmployee',
        userId: CREATOR_ID,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('cannot_remove_owner');
      }
    });

    it('returns EmployeeNotFoundError for unknown user', () => {
      const state = createOrg();
      const result = OrganizationEntity.removeEmployee(state, {
        type: 'RemoveEmployee',
        userId: UserId.raw('unknown'),
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('employee_not_found');
      }
    });
  });

  describe('changeEmployeeRole', () => {
    it('changes role of employee', () => {
      const state = orgWithTeamPlanAndEmployee();
      const result = OrganizationEntity.changeEmployeeRole(state, {
        type: 'ChangeEmployeeRole',
        userId: USER_2,
        roleId: ADMIN_ROLE_ID,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      const emp = result.value.state.employees.find(
        (e) => (e.userId as string) === (USER_2 as string),
      );
      expect(emp!.roleId).toBe(ADMIN_ROLE_ID);
    });

    it('returns EmployeeNotFoundError for unknown user', () => {
      const state = createOrg();
      const result = OrganizationEntity.changeEmployeeRole(state, {
        type: 'ChangeEmployeeRole',
        userId: UserId.raw('unknown'),
        roleId: ADMIN_ROLE_ID,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('employee_not_found');
      }
    });

    it('returns RoleNotFoundError for unknown role', () => {
      const state = orgWithTeamPlanAndEmployee();
      const result = OrganizationEntity.changeEmployeeRole(state, {
        type: 'ChangeEmployeeRole',
        userId: USER_2,
        roleId: EmployeeRoleId.raw('nonexistent'),
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('role_not_found');
      }
    });
  });

  describe('transferOwnership', () => {
    it('transfers ownership and assigns admin role to new owner', () => {
      const state = orgWithTeamPlanAndEmployee();
      const result = OrganizationEntity.transferOwnership(state, {
        type: 'TransferOwnership',
        fromUserId: CREATOR_ID,
        toUserId: USER_2,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      const oldOwner = result.value.state.employees.find(
        (e) => (e.userId as string) === (CREATOR_ID as string),
      );
      const newOwner = result.value.state.employees.find(
        (e) => (e.userId as string) === (USER_2 as string),
      );

      expect(oldOwner!.isOwner).toBe(false);
      expect(newOwner!.isOwner).toBe(true);
      expect(newOwner!.roleId).toBe(ADMIN_ROLE_ID);
    });

    it('returns TransferTargetNotEmployeeError for non-employee target', () => {
      const state = createOrg();
      const result = OrganizationEntity.transferOwnership(state, {
        type: 'TransferOwnership',
        fromUserId: CREATOR_ID,
        toUserId: UserId.raw('not-employee'),
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('transfer_target_not_employee');
      }
    });
  });

  describe('createEmployeeRole', () => {
    it('adds a new role', () => {
      const state = createOrg();
      const result = OrganizationEntity.createEmployeeRole(state, {
        type: 'CreateEmployeeRole',
        id: ROLE_2_ID,
        name: 'Editor',
        permissions: ['edit_items', 'publish_items'],
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      expect(result.value.state.roles).toHaveLength(2);
      expect(result.value.state.roles[1]!.name).toBe('Editor');
    });
  });

  describe('updateEmployeeRole', () => {
    it('updates role name and permissions', () => {
      const state = orgWithRole2();
      const result = OrganizationEntity.updateEmployeeRole(state, {
        type: 'UpdateEmployeeRole',
        roleId: ROLE_2_ID,
        name: 'Senior Editor',
        permissions: ['edit_items', 'publish_items', 'unpublish_items'],
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      const role = result.value.state.roles.find((r) => (r.id as string) === (ROLE_2_ID as string));
      expect(role!.name).toBe('Senior Editor');
      expect(role!.permissions).toContain('unpublish_items');
    });

    it('returns RoleNotFoundError for unknown role', () => {
      const state = createOrg();
      const result = OrganizationEntity.updateEmployeeRole(state, {
        type: 'UpdateEmployeeRole',
        roleId: EmployeeRoleId.raw('nonexistent'),
        name: 'X',
        permissions: [],
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('role_not_found');
      }
    });
  });

  describe('deleteEmployeeRole', () => {
    it('deletes role and reassigns employees', () => {
      const state = orgWithTeamPlanAndEmployee();
      const result = OrganizationEntity.deleteEmployeeRole(state, {
        type: 'DeleteEmployeeRole',
        roleId: ROLE_2_ID,
        replacementRoleId: ADMIN_ROLE_ID,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.roles).toHaveLength(1);
      const emp = result.value.state.employees.find(
        (e) => (e.userId as string) === (USER_2 as string),
      );
      expect(emp!.roleId).toBe(ADMIN_ROLE_ID);
    });

    it('returns CannotDeleteAdminRoleError for admin role', () => {
      const state = createOrg();
      const result = OrganizationEntity.deleteEmployeeRole(state, {
        type: 'DeleteEmployeeRole',
        roleId: ADMIN_ROLE_ID,
        replacementRoleId: ADMIN_ROLE_ID,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('cannot_delete_admin_role');
      }
    });

    it('returns RoleNotFoundError for unknown role', () => {
      const state = createOrg();
      const result = OrganizationEntity.deleteEmployeeRole(state, {
        type: 'DeleteEmployeeRole',
        roleId: EmployeeRoleId.raw('nonexistent'),
        replacementRoleId: ADMIN_ROLE_ID,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('role_not_found');
      }
    });

    it('returns RoleNotFoundError for unknown replacement role', () => {
      const state = orgWithRole2();
      const result = OrganizationEntity.deleteEmployeeRole(state, {
        type: 'DeleteEmployeeRole',
        roleId: ROLE_2_ID,
        replacementRoleId: EmployeeRoleId.raw('nonexistent'),
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('role_not_found');
      }
    });
  });

  describe('changeSubscription', () => {
    it('updates subscription plan', () => {
      const state = createOrg();
      const result = OrganizationEntity.changeSubscription(state, {
        type: 'ChangeSubscription',
        planId: 'team',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      const plan = SUBSCRIPTION_PLANS.team;
      expect(result.value.state.subscription.planId).toBe('team');
      expect(result.value.state.subscription.maxEmployees).toBe(plan.maxEmployees);
      expect(result.value.state.subscription.maxPublishedItems).toBe(plan.maxPublishedItems);
    });
  });

  describe('downgradeToFree', () => {
    it('downgrades and blocks excess employees', () => {
      let state = orgWithTeamPlanAndEmployee();

      // Add a third employee
      const role3 = OrganizationEntity.createEmployeeRole(state, {
        type: 'CreateEmployeeRole',
        id: ROLE_3_ID,
        name: 'Viewer',
        permissions: [],
        now: NOW,
      });
      if (isLeft(role3)) throw new Error('Expected Right');
      state = role3.value.state;

      const inv = OrganizationEntity.inviteEmployee(state, {
        type: 'InviteEmployee',
        userId: USER_3,
        roleId: ROLE_3_ID,
        now: NOW,
      });
      if (isLeft(inv)) throw new Error('Expected Right');
      state = inv.value.state;

      expect(state.employees).toHaveLength(3);

      const result = OrganizationEntity.downgradeToFree(state, {
        type: 'DowngradeToFree',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      // Free plan = 1 employee max → only owner remains
      expect(result.value.state.employees).toHaveLength(1);
      expect(result.value.state.employees[0]!.isOwner).toBe(true);
      expect(result.value.state.subscription.planId).toBe('free');
      expect(result.value.event.blockedEmployeeIds).toHaveLength(2);
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  RoleNotFoundError,
  StaticRoleModificationError,
} from '../../../domain/aggregates/role/errors.js';
import type { RoleState } from '../../../domain/aggregates/role/state.js';
import type { RoleRepository } from '../../ports.js';
import { UpdateRoleInteractor } from './update-role.interactor.js';
import { PermissionsStore } from '@/infra/lib/authorization/permissions-store.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import { RoleId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const ROLE_ID = RoleId.raw('role-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeRole = (overrides?: Partial<RoleState>): RoleState => ({
  id: ROLE_ID,
  name: 'Editor',
  permissions: { 'ROLE.MANAGE': false },
  isStatic: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeDeps = () => {
  const roleRepo = ServiceMock<RoleRepository>();
  roleRepo.findById.mockResolvedValue(makeRole());
  roleRepo.save.mockResolvedValue(undefined);

  const permissionsStore = ServiceMock<PermissionsStore>();
  permissionsStore.refresh.mockResolvedValue(undefined);

  return { roleRepo, permissionsStore };
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('UpdateRoleInteractor', () => {
  it('обновляет разрешения роли', async () => {
    const { roleRepo, permissionsStore } = makeDeps();
    const txHost = new MockTransactionHost();

    const interactor = new UpdateRoleInteractor(roleRepo, txHost, makeClock(), permissionsStore);

    const result = await interactor.execute({
      roleId: ROLE_ID,
      permissions: { 'ROLE.MANAGE': true },
    });

    expect(isRight(result)).toBe(true);
    expect(roleRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({
        id: ROLE_ID,
        permissions: { 'ROLE.MANAGE': true },
      }),
    );
    expect(permissionsStore.refresh).toHaveBeenCalled();
  });

  it('возвращает RoleNotFoundError если роль не найдена', async () => {
    const { roleRepo, permissionsStore } = makeDeps();
    roleRepo.findById.mockResolvedValue(null);

    const interactor = new UpdateRoleInteractor(
      roleRepo,
      new MockTransactionHost(),
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      roleId: ROLE_ID,
      permissions: {},
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(RoleNotFoundError);
    }
    expect(roleRepo.save).not.toHaveBeenCalled();
  });

  it('возвращает StaticRoleModificationError если роль статическая', async () => {
    const { roleRepo, permissionsStore } = makeDeps();
    roleRepo.findById.mockResolvedValue(makeRole({ isStatic: true }));

    const interactor = new UpdateRoleInteractor(
      roleRepo,
      new MockTransactionHost(),
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      roleId: ROLE_ID,
      permissions: {},
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(StaticRoleModificationError);
    }
    expect(roleRepo.save).not.toHaveBeenCalled();
  });
});

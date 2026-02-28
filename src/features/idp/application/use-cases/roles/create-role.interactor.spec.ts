import { describe, expect, it } from 'vitest';

import { RoleAlreadyExistsError } from '../../../domain/aggregates/role/errors.js';
import type { RoleState } from '../../../domain/aggregates/role/state.js';
import type { IdGenerator, RoleRepository } from '../../ports.js';
import { CreateRoleInteractor } from './create-role.interactor.js';
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

const makeExistingRole = (): RoleState => ({
  id: ROLE_ID,
  name: 'Editor',
  permissions: {},
  isStatic: false,
  createdAt: NOW,
  updatedAt: NOW,
});

const makeDeps = () => {
  const roleRepo = ServiceMock<RoleRepository>();
  roleRepo.findByName.mockResolvedValue(null);
  roleRepo.save.mockResolvedValue(undefined);

  const idGenerator = ServiceMock<IdGenerator>();
  idGenerator.generateRoleId.mockReturnValue(ROLE_ID);

  const permissionsStore = ServiceMock<PermissionsStore>();
  permissionsStore.refresh.mockResolvedValue(undefined);

  return { roleRepo, idGenerator, permissionsStore };
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('CreateRoleInteractor', () => {
  it('создаёт роль и сохраняет состояние', async () => {
    const { roleRepo, idGenerator, permissionsStore } = makeDeps();
    const txHost = new MockTransactionHost();

    const interactor = new CreateRoleInteractor(
      roleRepo,
      idGenerator,
      txHost,
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      name: 'Editor',
      permissions: { 'ROLE.MANAGE': true },
    });

    expect(isRight(result)).toBe(true);
    expect(roleRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({
        id: ROLE_ID,
        name: 'Editor',
        permissions: { 'ROLE.MANAGE': true },
        isStatic: false,
      }),
    );
    expect(permissionsStore.refresh).toHaveBeenCalled();
  });

  it('возвращает RoleAlreadyExistsError если роль с таким именем существует', async () => {
    const { roleRepo, idGenerator, permissionsStore } = makeDeps();
    roleRepo.findByName.mockResolvedValue(makeExistingRole());

    const interactor = new CreateRoleInteractor(
      roleRepo,
      idGenerator,
      new MockTransactionHost(),
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      name: 'Editor',
      permissions: {},
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(RoleAlreadyExistsError);
    }
    expect(roleRepo.save).not.toHaveBeenCalled();
  });
});

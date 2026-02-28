import { describe, expect, it } from 'vitest';

import {
  RoleNotFoundError,
  StaticRoleModificationError,
} from '../../../domain/aggregates/role/errors.js';
import type { RoleState } from '../../../domain/aggregates/role/state.js';
import type { SessionState } from '../../../domain/aggregates/session/state.js';
import type { UserState } from '../../../domain/aggregates/user/state.js';
import { FullName } from '../../../domain/vo/full-name.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import type { RoleRepository, SessionRepository, UserRepository } from '../../ports.js';
import { DeleteRoleInteractor } from './delete-role.interactor.js';
import { PermissionsStore } from '@/infra/lib/authorization/permissions-store.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import { RoleId, SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const ROLE_ID = RoleId.raw('role-to-delete');
const REPLACEMENT_ROLE_ID = RoleId.raw('role-replacement');
const USER_ID = UserId.raw('user-1');
const SESSION_ID = SessionId.raw('session-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeRole = (overrides?: Partial<RoleState>): RoleState => ({
  id: ROLE_ID,
  name: 'OldRole',
  permissions: {},
  isStatic: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeReplacementRole = (): RoleState => ({
  id: REPLACEMENT_ROLE_ID,
  name: 'NewRole',
  permissions: {},
  isStatic: false,
  createdAt: NOW,
  updatedAt: NOW,
});

const makeUser = (): UserState => ({
  id: USER_ID,
  phoneNumber: PhoneNumber.raw('79991234567'),
  fullName: FullName.raw('Иван Иванов'),
  role: Role.raw('OldRole'),
  createdAt: NOW,
  updatedAt: NOW,
});

const makeSession = (): SessionState => ({
  id: SESSION_ID,
  userId: USER_ID,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
});

const makeDeps = () => {
  const roleRepo = ServiceMock<RoleRepository>();
  roleRepo.findById.mockResolvedValue(null);
  roleRepo.deleteById.mockResolvedValue(undefined);

  const userRepo = ServiceMock<UserRepository>();
  userRepo.findByRoleName.mockResolvedValue([]);
  userRepo.save.mockResolvedValue(undefined);

  const sessionRepo = ServiceMock<SessionRepository>();
  sessionRepo.findByUserId.mockResolvedValue([]);
  sessionRepo.deleteById.mockResolvedValue(undefined);

  const permissionsStore = ServiceMock<PermissionsStore>();
  permissionsStore.refresh.mockResolvedValue(undefined);

  return { roleRepo, userRepo, sessionRepo, permissionsStore };
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('DeleteRoleInteractor', () => {
  it('удаляет роль без затронутых пользователей', async () => {
    const { roleRepo, userRepo, sessionRepo, permissionsStore } = makeDeps();
    const txHost = new MockTransactionHost();

    roleRepo.findById
      .mockResolvedValueOnce(makeRole()) // роль для удаления
      .mockResolvedValueOnce(makeReplacementRole()); // замещающая роль

    const interactor = new DeleteRoleInteractor(
      roleRepo,
      userRepo,
      sessionRepo,
      txHost,
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      roleId: ROLE_ID,
      replacementRoleId: REPLACEMENT_ROLE_ID,
    });

    expect(isRight(result)).toBe(true);
    expect(roleRepo.deleteById).toHaveBeenCalledWith(txHost.transaction, ROLE_ID);
    expect(permissionsStore.refresh).toHaveBeenCalled();
  });

  it('возвращает RoleNotFoundError если роль не найдена', async () => {
    const { roleRepo, userRepo, sessionRepo, permissionsStore } = makeDeps();

    roleRepo.findById.mockResolvedValue(null);

    const interactor = new DeleteRoleInteractor(
      roleRepo,
      userRepo,
      sessionRepo,
      new MockTransactionHost(),
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      roleId: ROLE_ID,
      replacementRoleId: REPLACEMENT_ROLE_ID,
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(RoleNotFoundError);
    }
  });

  it('возвращает RoleNotFoundError если замещающая роль не найдена', async () => {
    const { roleRepo, userRepo, sessionRepo, permissionsStore } = makeDeps();

    roleRepo.findById
      .mockResolvedValueOnce(makeRole()) // роль для удаления найдена
      .mockResolvedValueOnce(null); // замещающая роль не найдена

    const interactor = new DeleteRoleInteractor(
      roleRepo,
      userRepo,
      sessionRepo,
      new MockTransactionHost(),
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      roleId: ROLE_ID,
      replacementRoleId: REPLACEMENT_ROLE_ID,
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(RoleNotFoundError);
    }
  });

  it('возвращает StaticRoleModificationError если роль статическая', async () => {
    const { roleRepo, userRepo, sessionRepo, permissionsStore } = makeDeps();

    roleRepo.findById
      .mockResolvedValueOnce(makeRole({ isStatic: true }))
      .mockResolvedValueOnce(makeReplacementRole());

    const interactor = new DeleteRoleInteractor(
      roleRepo,
      userRepo,
      sessionRepo,
      new MockTransactionHost(),
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      roleId: ROLE_ID,
      replacementRoleId: REPLACEMENT_ROLE_ID,
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(StaticRoleModificationError);
    }
  });

  it('обновляет роли пользователей и удаляет их сессии (policy chain)', async () => {
    const { roleRepo, userRepo, sessionRepo, permissionsStore } = makeDeps();
    const txHost = new MockTransactionHost();

    roleRepo.findById
      .mockResolvedValueOnce(makeRole())
      .mockResolvedValueOnce(makeReplacementRole());

    userRepo.findByRoleName.mockResolvedValue([makeUser()]);
    sessionRepo.findByUserId.mockResolvedValue([makeSession()]);

    const interactor = new DeleteRoleInteractor(
      roleRepo,
      userRepo,
      sessionRepo,
      txHost,
      makeClock(),
      permissionsStore,
    );

    const result = await interactor.execute({
      roleId: ROLE_ID,
      replacementRoleId: REPLACEMENT_ROLE_ID,
    });

    expect(isRight(result)).toBe(true);

    // Роль удалена
    expect(roleRepo.deleteById).toHaveBeenCalledWith(txHost.transaction, ROLE_ID);

    // Пользователь обновлён с новой ролью
    expect(userRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({
        id: USER_ID,
        role: Role.raw('NewRole'),
      }),
    );

    // Сессия пользователя удалена
    expect(sessionRepo.deleteById).toHaveBeenCalledWith(txHost.transaction, SESSION_ID);
  });
});

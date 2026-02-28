import { describe, expect, it } from 'vitest';

import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import type { RoleState } from '../../../domain/aggregates/role/state.js';
import type { SessionState } from '../../../domain/aggregates/session/state.js';
import type { UserState } from '../../../domain/aggregates/user/state.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { FullName } from '../../../domain/vo/full-name.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import type { RoleRepository, SessionRepository, UserRepository } from '../../ports.js';
import { UpdateUserRoleInteractor } from './update-user-role.interactor.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import { RoleId, SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const USER_ID = UserId.raw('user-1');
const ROLE_ID = RoleId.raw('role-new');
const SESSION_ID = SessionId.raw('session-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeRole = (): RoleState => ({
  id: ROLE_ID,
  name: 'Admin',
  permissions: { 'ROLE.MANAGE': true },
  isStatic: false,
  createdAt: NOW,
  updatedAt: NOW,
});

const makeUser = (): UserState => ({
  id: USER_ID,
  phoneNumber: PhoneNumber.raw('79991234567'),
  fullName: FullName.raw('Иван Иванов'),
  role: Role.raw('USER'),
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
  const userRepo = ServiceMock<UserRepository>();
  userRepo.findById.mockResolvedValue(makeUser());
  userRepo.save.mockResolvedValue(undefined);

  const roleRepo = ServiceMock<RoleRepository>();
  roleRepo.findById.mockResolvedValue(makeRole());

  const sessionRepo = ServiceMock<SessionRepository>();
  sessionRepo.findByUserId.mockResolvedValue([]);
  sessionRepo.deleteById.mockResolvedValue(undefined);

  return { userRepo, roleRepo, sessionRepo };
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('UpdateUserRoleInteractor', () => {
  it('обновляет роль пользователя', async () => {
    const { userRepo, roleRepo, sessionRepo } = makeDeps();
    const txHost = new MockTransactionHost();

    const interactor = new UpdateUserRoleInteractor(
      userRepo,
      roleRepo,
      sessionRepo,
      txHost,
      makeClock(),
    );

    const result = await interactor.execute({ userId: USER_ID, roleId: ROLE_ID });

    expect(isRight(result)).toBe(true);
    expect(userRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({
        id: USER_ID,
        role: Role.raw('Admin'),
      }),
    );
  });

  it('возвращает RoleNotFoundError если роль не найдена', async () => {
    const { userRepo, roleRepo, sessionRepo } = makeDeps();
    roleRepo.findById.mockResolvedValue(null);

    const interactor = new UpdateUserRoleInteractor(
      userRepo,
      roleRepo,
      sessionRepo,
      new MockTransactionHost(),
      makeClock(),
    );

    const result = await interactor.execute({ userId: USER_ID, roleId: ROLE_ID });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(RoleNotFoundError);
    }
  });

  it('возвращает UserNotFoundError если пользователь не найден', async () => {
    const { userRepo, roleRepo, sessionRepo } = makeDeps();
    userRepo.findById.mockResolvedValue(null);

    const interactor = new UpdateUserRoleInteractor(
      userRepo,
      roleRepo,
      sessionRepo,
      new MockTransactionHost(),
      makeClock(),
    );

    const result = await interactor.execute({ userId: USER_ID, roleId: ROLE_ID });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(UserNotFoundError);
    }
  });

  it('удаляет сессии пользователя после смены роли', async () => {
    const { userRepo, roleRepo, sessionRepo } = makeDeps();
    const txHost = new MockTransactionHost();

    sessionRepo.findByUserId.mockResolvedValue([makeSession()]);

    const interactor = new UpdateUserRoleInteractor(
      userRepo,
      roleRepo,
      sessionRepo,
      txHost,
      makeClock(),
    );

    const result = await interactor.execute({ userId: USER_ID, roleId: ROLE_ID });

    expect(isRight(result)).toBe(true);
    expect(sessionRepo.deleteById).toHaveBeenCalledWith(txHost.transaction, SESSION_ID);
  });
});

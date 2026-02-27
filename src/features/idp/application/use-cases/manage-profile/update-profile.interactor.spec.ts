import { describe, expect, it } from 'vitest';

import type { UserState } from '../../../domain/aggregates/user/state.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { FullName } from '../../../domain/vo/full-name.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import type { UserRepository } from '../../ports.js';
import { UpdateProfileInteractor } from './update-profile.interactor.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import type { UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const USER_ID = 'user-1' as UserId;
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeUser = (): UserState => ({
  id: USER_ID,
  phoneNumber: PhoneNumber.raw('79991234567'),
  fullName: FullName.raw('Иван Иванов'),
  role: 'USER' as Role,
  createdAt: NOW,
  updatedAt: NOW,
});

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('UpdateProfileInteractor', () => {
  it('обновляет профиль пользователя', async () => {
    const userRepo = ServiceMock<UserRepository>();
    userRepo.findById.mockResolvedValue(makeUser());
    userRepo.save.mockResolvedValue(undefined);
    const txHost = new MockTransactionHost();

    const interactor = new UpdateProfileInteractor(makeClock(), userRepo, txHost);

    const result = await interactor.execute({ userId: USER_ID, fullName: 'Пётр Петров' });

    expect(isRight(result)).toBe(true);
    expect(userRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({ fullName: FullName.raw('Пётр Петров'), updatedAt: NOW }),
    );
  });

  it('возвращает ошибку при невалидном имени', async () => {
    const userRepo = ServiceMock<UserRepository>();
    const interactor = new UpdateProfileInteractor(
      makeClock(),
      userRepo,
      new MockTransactionHost(),
    );

    const result = await interactor.execute({ userId: USER_ID, fullName: '' });

    expect(isLeft(result)).toBe(true);
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('возвращает UserNotFoundError если пользователь не найден', async () => {
    const userRepo = ServiceMock<UserRepository>();
    userRepo.findById.mockResolvedValue(null);

    const interactor = new UpdateProfileInteractor(
      makeClock(),
      userRepo,
      new MockTransactionHost(),
    );

    const result = await interactor.execute({ userId: USER_ID, fullName: 'Пётр Петров' });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(UserNotFoundError);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import type { MeReadModel } from '../../../domain/read-models/me.read-model.js';
import type { FullName } from '../../../domain/vo/full-name.js';
import type { MeQueryPort } from '../../ports.js';
import { GetMeInteractor } from './get-me.interactor.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { ServiceMock } from '@/infra/test/mock.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const USER_ID = UserId.raw('user-1');
const SESSION_ID = SessionId.raw('session-1');

const ME_READ_MODEL: MeReadModel = {
  userId: USER_ID,
  role: Role.raw('USER'),
  sessionId: SESSION_ID,
  fullName: 'Иван Иванов' as FullName,
  avatarId: undefined,
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('GetMeInteractor', () => {
  it('возвращает профиль пользователя', async () => {
    const meQuery = ServiceMock<MeQueryPort>();
    meQuery.findMe.mockResolvedValue(ME_READ_MODEL);

    const interactor = new GetMeInteractor(meQuery);
    const result = await interactor.execute({ userId: USER_ID, sessionId: SESSION_ID });

    expect(result).toEqual(Right(ME_READ_MODEL));
    expect(meQuery.findMe).toHaveBeenCalledWith(USER_ID, SESSION_ID);
  });

  it('возвращает UserNotFoundError если пользователь не найден', async () => {
    const meQuery = ServiceMock<MeQueryPort>();
    meQuery.findMe.mockResolvedValue(null);

    const interactor = new GetMeInteractor(meQuery);
    const result = await interactor.execute({ userId: USER_ID, sessionId: SESSION_ID });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(UserNotFoundError);
    }
  });
});

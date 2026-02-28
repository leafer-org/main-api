import { describe, expect, it } from 'vitest';

import type { UserSessionsReadModel } from '../../../domain/read-models/user-sessions.read-model.js';
import type { UserSessionsQueryPort } from '../../ports.js';
import { GetUserSessionsInteractor } from './get-user-sessions.interactor.js';
import { Right } from '@/infra/lib/box.js';
import { ServiceMock } from '@/infra/test/mock.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const USER_ID = UserId.raw('user-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const READ_MODEL: UserSessionsReadModel = {
  userId: USER_ID,
  sessions: [
    {
      id: SessionId.raw('session-1'),
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
  ],
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('GetUserSessionsInteractor', () => {
  it('возвращает список сессий пользователя', async () => {
    const sessionsQuery = ServiceMock<UserSessionsQueryPort>();
    sessionsQuery.findUserSessions.mockResolvedValue(READ_MODEL);

    const interactor = new GetUserSessionsInteractor(sessionsQuery);
    const result = await interactor.execute({ userId: USER_ID });

    expect(result).toEqual(Right(READ_MODEL));
    expect(sessionsQuery.findUserSessions).toHaveBeenCalledWith(USER_ID);
  });
});

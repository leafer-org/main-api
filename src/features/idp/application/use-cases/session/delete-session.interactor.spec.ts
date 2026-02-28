import { describe, expect, it } from 'vitest';

import { SessionNotFoundError } from '../../../domain/aggregates/session/errors.js';
import type { SessionState } from '../../../domain/aggregates/session/state.js';
import type { SessionRepository } from '../../ports.js';
import { DeleteSessionInteractor } from './delete-session.interactor.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const SESSION_ID = SessionId.raw('session-1');
const USER_ID = UserId.raw('user-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeSession = (): SessionState => ({
  id: SESSION_ID,
  userId: USER_ID,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('DeleteSessionInteractor', () => {
  it('удаляет существующую сессию', async () => {
    const sessionRepo = ServiceMock<SessionRepository>();
    sessionRepo.findById.mockResolvedValue(makeSession());
    sessionRepo.deleteById.mockResolvedValue(undefined);
    const txHost = new MockTransactionHost();

    const interactor = new DeleteSessionInteractor(sessionRepo, txHost);
    const result = await interactor.execute({ sessionId: SESSION_ID });

    expect(result).toEqual(Right(undefined));
    expect(sessionRepo.deleteById).toHaveBeenCalledWith(txHost.transaction, SESSION_ID);
  });

  it('возвращает SessionNotFoundError если сессия не найдена', async () => {
    const sessionRepo = ServiceMock<SessionRepository>();
    sessionRepo.findById.mockResolvedValue(null);

    const interactor = new DeleteSessionInteractor(sessionRepo, new MockTransactionHost());
    const result = await interactor.execute({ sessionId: SESSION_ID });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(SessionNotFoundError);
    }
  });
});

import { describe, expect, it } from 'vitest';

import type { SessionRepository } from '../../ports.js';
import { DeleteAllSessionsInteractor } from './delete-all-sessions.interactor.js';
import { Right } from '@/infra/lib/box.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const USER_ID = UserId.raw('user-1');
const CURRENT_SESSION_ID = SessionId.raw('session-current');

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('DeleteAllSessionsInteractor', () => {
  it('удаляет все сессии кроме текущей', async () => {
    const sessionRepo = ServiceMock<SessionRepository>();
    sessionRepo.deleteAllByUserIdExcept.mockResolvedValue(undefined);
    const txHost = new MockTransactionHost();

    const interactor = new DeleteAllSessionsInteractor(sessionRepo, txHost);
    const result = await interactor.execute({
      userId: USER_ID,
      currentSessionId: CURRENT_SESSION_ID,
    });

    expect(result).toEqual(Right(undefined));
    expect(sessionRepo.deleteAllByUserIdExcept).toHaveBeenCalledWith(
      txHost.transaction,
      USER_ID,
      CURRENT_SESSION_ID,
    );
  });
});

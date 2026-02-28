import { describe, expect, it } from 'vitest';

import {
  SessionExpiredError,
  SessionNotFoundError,
} from '../../../domain/aggregates/session/errors.js';
import type { SessionState } from '../../../domain/aggregates/session/state.js';
import type { UserState } from '../../../domain/aggregates/user/state.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { FullName } from '../../../domain/vo/full-name.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import { AccessToken, RefreshToken } from '../../../domain/vo/tokens.js';
import type {
  IdGenerator,
  JwtAccessService,
  RefreshTokenService,
  SessionRepository,
  UserRepository,
} from '../../ports.js';
import { RotateSessionInteractor } from './rotate-session.interactor.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const NOW = new Date('2024-06-01T12:00:00.000Z');
const SESSION_ID = SessionId.raw('session-1');
const NEW_SESSION_ID = SessionId.raw('session-2');
const USER_ID = UserId.raw('user-1');
const ACCESS_TOKEN = AccessToken.raw('access-token');
const REFRESH_TOKEN = RefreshToken.raw('refresh-token');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const makeSession = (): SessionState => ({
  id: SESSION_ID,
  userId: USER_ID,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
});

const makeUser = (): UserState => ({
  id: USER_ID,
  phoneNumber: PhoneNumber.raw('79991234567'),
  fullName: FullName.raw('Иван Иванов'),
  role: Role.raw('USER'),
  createdAt: NOW,
  updatedAt: NOW,
});

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeDeps = () => {
  const sessionRepo = ServiceMock<SessionRepository>();
  sessionRepo.findById.mockResolvedValue(makeSession());
  sessionRepo.save.mockResolvedValue(undefined);
  sessionRepo.deleteById.mockResolvedValue(undefined);

  const userRepo = ServiceMock<UserRepository>();
  userRepo.findById.mockResolvedValue(makeUser());

  const refreshTokens = ServiceMock<RefreshTokenService>();
  refreshTokens.verify.mockReturnValue({
    sessionId: SESSION_ID,
    userId: USER_ID,
    type: 'refresh',
  });
  refreshTokens.sign.mockReturnValue(REFRESH_TOKEN);

  const jwtAccess = ServiceMock<JwtAccessService>();
  jwtAccess.sign.mockReturnValue(ACCESS_TOKEN);

  const idGenerator = ServiceMock<IdGenerator>();
  idGenerator.generateSessionId.mockReturnValue(NEW_SESSION_ID);

  return { sessionRepo, userRepo, refreshTokens, jwtAccess, idGenerator };
};

const makeInteractor = (deps: ReturnType<typeof makeDeps>) => {
  const txHost = new MockTransactionHost();
  return {
    interactor: new RotateSessionInteractor(
      makeClock(),
      deps.sessionRepo,
      deps.userRepo,
      deps.refreshTokens,
      deps.jwtAccess,
      deps.idGenerator,
      txHost,
    ),
    txHost,
  };
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('RotateSessionInteractor', () => {
  it('ротирует сессию и возвращает новые токены', async () => {
    const deps = makeDeps();
    const { interactor, txHost } = makeInteractor(deps);

    const result = await interactor.execute({ refreshToken: 'old-refresh-token' });

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(result.value).toEqual({
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
      });
    }

    // Старая сессия удалена, новая сохранена
    expect(deps.sessionRepo.deleteById).toHaveBeenCalledWith(txHost.transaction, SESSION_ID);
    expect(deps.sessionRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({ id: NEW_SESSION_ID, userId: USER_ID }),
    );
  });

  it('верифицирует refresh token и подписывает новые токены с данными пользователя', async () => {
    const deps = makeDeps();
    const { interactor } = makeInteractor(deps);

    await interactor.execute({ refreshToken: 'old-refresh-token' });

    expect(deps.refreshTokens.verify).toHaveBeenCalledWith('old-refresh-token');
    expect(deps.jwtAccess.sign).toHaveBeenCalledWith({
      userId: USER_ID,
      role: 'USER',
      sessionId: NEW_SESSION_ID,
    });
    expect(deps.refreshTokens.sign).toHaveBeenCalledWith({
      sessionId: NEW_SESSION_ID,
      userId: USER_ID,
      type: 'refresh',
    });
  });

  it('возвращает SessionNotFoundError если сессия не найдена', async () => {
    const deps = makeDeps();
    deps.sessionRepo.findById.mockResolvedValue(null);

    const { interactor } = makeInteractor(deps);
    const result = await interactor.execute({ refreshToken: 'old-refresh-token' });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(SessionNotFoundError);
    }
  });

  it('возвращает UserNotFoundError если пользователь не найден', async () => {
    const deps = makeDeps();
    deps.userRepo.findById.mockResolvedValue(null);

    const { interactor } = makeInteractor(deps);
    const result = await interactor.execute({ refreshToken: 'old-refresh-token' });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(UserNotFoundError);
    }
  });

  it('возвращает SessionExpiredError и удаляет просроченную сессию', async () => {
    const deps = makeDeps();
    const expiredSession: SessionState = {
      ...makeSession(),
      expiresAt: new Date(NOW.getTime() - 1),
    };
    deps.sessionRepo.findById.mockResolvedValue(expiredSession);

    const { interactor, txHost } = makeInteractor(deps);
    const result = await interactor.execute({ refreshToken: 'old-refresh-token' });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(SessionExpiredError);
    }
    expect(deps.sessionRepo.deleteById).toHaveBeenCalledWith(txHost.transaction, SESSION_ID);
  });
});

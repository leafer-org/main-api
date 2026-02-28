import { describe, expect, it } from 'vitest';

import { RegistractionError } from '../../../domain/aggregates/login-process/errors.js';
import type {
  LoginProcessId,
  LoginProcessState,
} from '../../../domain/aggregates/login-process/state.js';
import { FingerPrint } from '../../../domain/vo/finger-print.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import { AccessToken, RefreshToken } from '../../../domain/vo/tokens.js';
import type {
  IdGenerator,
  JwtAccessService,
  LoginProcessRepository,
  RefreshTokenService,
  SessionRepository,
  UserRepository,
} from '../../ports.js';
import { RegisterInteractor } from './register.interactor.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const NOW = new Date('2024-06-01T12:00:00.000Z');
const PROCESS_ID = 'proc-1' as LoginProcessId;
const USER_ID = UserId.raw('user-1');
const SESSION_ID = SessionId.raw('session-1');
const REGISTRATION_SESSION_ID = String(PROCESS_ID);
const ACCESS_TOKEN = AccessToken.raw('access-token');
const REFRESH_TOKEN = RefreshToken.raw('refresh-token');

const makeNewRegistration = (): LoginProcessState => ({
  type: 'NewRegistration',
  id: PROCESS_ID,
  phoneNumber: PhoneNumber.raw('79991234567'),
  fingerPrint: FingerPrint.fromIp('127.0.0.1'),
  registrationSessionId: REGISTRATION_SESSION_ID,
});

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeDeps = () => {
  const loginProcessRepo = ServiceMock<LoginProcessRepository>();
  loginProcessRepo.findByRegistrationSessionId.mockResolvedValue(makeNewRegistration());
  loginProcessRepo.save.mockResolvedValue(undefined);

  const userRepo = ServiceMock<UserRepository>();
  userRepo.save.mockResolvedValue(undefined);

  const sessionRepo = ServiceMock<SessionRepository>();
  sessionRepo.save.mockResolvedValue(undefined);

  const jwtAccess = ServiceMock<JwtAccessService>();
  jwtAccess.sign.mockReturnValue(ACCESS_TOKEN);

  const refreshTokens = ServiceMock<RefreshTokenService>();
  refreshTokens.sign.mockReturnValue(REFRESH_TOKEN);

  const idGenerator = ServiceMock<IdGenerator>();
  idGenerator.generateUserId.mockReturnValue(USER_ID);
  idGenerator.generateSessionId.mockReturnValue(SESSION_ID);

  return { loginProcessRepo, userRepo, sessionRepo, jwtAccess, refreshTokens, idGenerator };
};

const makeInteractor = (deps: ReturnType<typeof makeDeps>) => {
  const txHost = new MockTransactionHost();
  return {
    interactor: new RegisterInteractor(
      makeClock(),
      deps.loginProcessRepo,
      deps.userRepo,
      deps.sessionRepo,
      deps.jwtAccess,
      deps.refreshTokens,
      deps.idGenerator,
      txHost,
    ),
    txHost,
  };
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('RegisterInteractor', () => {
  it('регистрирует пользователя, создаёт сессию и возвращает токены', async () => {
    const deps = makeDeps();
    const { interactor, txHost } = makeInteractor(deps);

    const result = await interactor.execute({
      registrationSessionId: REGISTRATION_SESSION_ID,
      fullName: 'Иван Иванов',
    });

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(result.value).toEqual({
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
      });
    }

    // Пользователь создан
    expect(deps.userRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({ id: USER_ID, phoneNumber: PhoneNumber.raw('79991234567') }),
    );

    // Сессия создана
    expect(deps.sessionRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({ id: SESSION_ID, userId: USER_ID }),
    );

    // Процесс сохранён в состоянии Success
    expect(deps.loginProcessRepo.save).toHaveBeenCalledWith(
      txHost.transaction,
      expect.objectContaining({ type: 'Success' }),
    );
  });

  it('подписывает токены с данными из созданных user и session', async () => {
    const deps = makeDeps();
    const { interactor } = makeInteractor(deps);

    await interactor.execute({
      registrationSessionId: REGISTRATION_SESSION_ID,
      fullName: 'Иван Иванов',
    });

    expect(deps.jwtAccess.sign).toHaveBeenCalledWith({
      userId: USER_ID,
      role: 'USER',
      sessionId: SESSION_ID,
    });
    expect(deps.refreshTokens.sign).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: USER_ID,
      type: 'refresh',
    });
  });

  it('возвращает RegistractionError если состояние не NewRegistration', async () => {
    const deps = makeDeps();
    deps.loginProcessRepo.findByRegistrationSessionId.mockResolvedValue({
      type: 'OtpRequested',
      id: PROCESS_ID,
      phoneNumber: PhoneNumber.raw('79991234567'),
      fingerPrint: FingerPrint.fromIp('127.0.0.1'),
      codeHash: '' as never,
      expiresAt: new Date(NOW.getTime() + 300_000),
      verifyAttempts: 0,
      requestedAt: NOW,
    });

    const { interactor } = makeInteractor(deps);
    const result = await interactor.execute({
      registrationSessionId: REGISTRATION_SESSION_ID,
      fullName: 'Иван Иванов',
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(RegistractionError);
    }
  });

  it('возвращает RegistractionError если процесс не найден', async () => {
    const deps = makeDeps();
    deps.loginProcessRepo.findByRegistrationSessionId.mockResolvedValue(null);

    const { interactor } = makeInteractor(deps);
    const result = await interactor.execute({
      registrationSessionId: REGISTRATION_SESSION_ID,
      fullName: 'Иван Иванов',
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(RegistractionError);
    }
  });
});

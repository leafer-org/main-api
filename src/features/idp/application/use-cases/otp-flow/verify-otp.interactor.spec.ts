import { describe, expect, it } from 'vitest';

import { LOGIN_PROCESS_CONFIG } from '../../../domain/aggregates/login-process/config.js';
import { InvalidOtpError } from '../../../domain/aggregates/login-process/errors.js';
import type {
  LoginProcessId,
  RequestedLoginProcessState,
} from '../../../domain/aggregates/login-process/state.js';
import { FingerPrint } from '../../../domain/vo/finger-print.js';
import { OtpCode, OtpCodeHash } from '../../../domain/vo/otp.js';
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
import { VerifyOtpInteractor } from './verify-otp.interactor.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MockTransactionHost, ServiceMock } from '@/infra/test/mock.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const PHONE = '79991234567';
const IP = '127.0.0.1';
const NOW = new Date('2024-06-01T12:00:00.000Z');
const OTP = OtpCode.raw('123456');
const PROCESS_ID = 'proc-1' as LoginProcessId;
const USER_ID = UserId.raw('user-1');
const SESSION_ID = SessionId.raw('session-1');
const ACCESS_TOKEN = AccessToken.raw('access-token');
const REFRESH_TOKEN = RefreshToken.raw('refresh-token');

const makeOtpRequested = (): RequestedLoginProcessState => ({
  type: 'OtpRequested',
  id: PROCESS_ID,
  phoneNumber: PhoneNumber.raw(PHONE),
  fingerPrint: FingerPrint.fromIp(IP),
  codeHash: OtpCodeHash.create(OTP),
  expiresAt: new Date(NOW.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
  verifyAttempts: 0,
  requestedAt: NOW,
});

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeDeps = () => {
  const loginProcessRepo = ServiceMock<LoginProcessRepository>();
  loginProcessRepo.findLatestBy.mockResolvedValue(makeOtpRequested());
  loginProcessRepo.save.mockResolvedValue(undefined);

  const userRepo = ServiceMock<UserRepository>();
  const sessionRepo = ServiceMock<SessionRepository>();
  sessionRepo.save.mockResolvedValue(undefined);

  const jwtAccess = ServiceMock<JwtAccessService>();
  jwtAccess.sign.mockReturnValue(ACCESS_TOKEN);

  const refreshTokens = ServiceMock<RefreshTokenService>();
  refreshTokens.sign.mockReturnValue(REFRESH_TOKEN);

  const idGenerator = ServiceMock<IdGenerator>();
  idGenerator.generateSessionId.mockReturnValue(SESSION_ID);

  return { loginProcessRepo, userRepo, sessionRepo, jwtAccess, refreshTokens, idGenerator };
};

const makeInteractor = (deps: ReturnType<typeof makeDeps>) =>
  new VerifyOtpInteractor(
    makeClock(),
    deps.loginProcessRepo,
    deps.userRepo,
    deps.sessionRepo,
    deps.jwtAccess,
    deps.refreshTokens,
    deps.idGenerator,
    new MockTransactionHost(),
  );

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('VerifyOtpInteractor', () => {
  it('логинит существующего пользователя и возвращает токены', async () => {
    const deps = makeDeps();
    deps.userRepo.findByPhoneNumber.mockResolvedValue({ id: USER_ID, role: Role.raw('USER') });

    const interactor = makeInteractor(deps);
    const result = await interactor.execute({ phoneNumber: PHONE, code: '123456', ip: IP });

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(result.value).toEqual({
        type: 'success',
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
      });
    }
    expect(deps.sessionRepo.save).toHaveBeenCalled();
    expect(deps.loginProcessRepo.save).toHaveBeenCalled();
  });

  it('возвращает new_registration для нового пользователя', async () => {
    const deps = makeDeps();
    deps.userRepo.findByPhoneNumber.mockResolvedValue(null);

    const interactor = makeInteractor(deps);
    const result = await interactor.execute({ phoneNumber: PHONE, code: '123456', ip: IP });

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(result.value).toEqual({
        type: 'new_registration',
        registrationSessionId: String(PROCESS_ID),
      });
    }
  });

  it('при логине подписывает токены с правильными данными', async () => {
    const deps = makeDeps();
    deps.userRepo.findByPhoneNumber.mockResolvedValue({ id: USER_ID, role: Role.raw('USER') });

    const interactor = makeInteractor(deps);
    await interactor.execute({ phoneNumber: PHONE, code: '123456', ip: IP });

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

  it('при new_registration не создаёт сессию и не подписывает токены', async () => {
    const deps = makeDeps();
    deps.userRepo.findByPhoneNumber.mockResolvedValue(null);

    const interactor = makeInteractor(deps);
    await interactor.execute({ phoneNumber: PHONE, code: '123456', ip: IP });

    expect(deps.sessionRepo.save).not.toHaveBeenCalled();
    expect(deps.jwtAccess.sign).not.toHaveBeenCalled();
    expect(deps.refreshTokens.sign).not.toHaveBeenCalled();
  });

  it('возвращает InvalidOtpError если процесс не найден', async () => {
    const deps = makeDeps();
    deps.loginProcessRepo.findLatestBy.mockResolvedValue(null);

    const interactor = makeInteractor(deps);
    const result = await interactor.execute({ phoneNumber: PHONE, code: '123456', ip: IP });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(InvalidOtpError);
    }
  });
});

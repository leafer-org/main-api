import { Inject, Injectable } from '@nestjs/common';

import { LoginProcessEntity } from '../../../domain/aggregates/login-process/entity.js';
import {
  InvalidOtpError,
  LoginBlockedError,
  OtpExpiredError,
} from '../../../domain/aggregates/login-process/errors.js';
import type {
  LoginCompletedEvent,
  NewRegistrationStartedEvent,
} from '../../../domain/aggregates/login-process/events.js';
import { SessionEntity } from '../../../domain/aggregates/session/entity.js';
import type { TokenPair } from '../../../domain/aggregates/session/token.types.js';
import { whenLoginCompletedCreateSession } from '../../../domain/policies/when-login-completed-create-session.policy.js';
import { FingerPrint } from '../../../domain/vo/finger-print.js';
import { OtpCode } from '../../../domain/vo/otp.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import {
  IdGenerator,
  JwtAccessService,
  LoginProcessRepository,
  RefreshTokenService,
  SessionRepository,
  UserRepository,
} from '../../ports.js';
import { createEventId } from '@/infra/ddd/event.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { Role } from '@/kernel/domain/vo/role.js';

type VerifyOtpResult =
  | { type: 'new_registration'; registrationSessionId: string }
  | ({ type: 'success' } & TokenPair);

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class VerifyOtpInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    private readonly loginProcessRepository: LoginProcessRepository,
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly jwtAccess: JwtAccessService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly idGenerator: IdGenerator,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { phoneNumber: string; code: string; ip?: string }) {
    const parsed = this.parseCommand(command);
    if (parsed.type === 'left') return parsed;

    const { phoneNumber, otpCode, fingerPrint } = parsed.value;
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.loginProcessRepository.findLatestBy(tx, phoneNumber, fingerPrint);
      if (!state) return Left(new InvalidOtpError());

      const user = await this.userRepository.findByPhoneNumber(tx, phoneNumber);
      const registrationSessionId = String(state.id);

      const lpResult = LoginProcessEntity.verifyOtp(state, {
        type: 'VerifyOtp',
        otpCode,
        now,
        registrationSessionId,
        user: user ? { id: user.id, role: Role.raw(user.role) } : undefined,
        generateEventId: createEventId,
      });

      if (isLeft(lpResult)) return lpResult;

      await this.loginProcessRepository.save(tx, lpResult.value.state);

      return this.mapResult(tx, lpResult.value.event, now, registrationSessionId);
    });
  }

  private parseCommand(command: { phoneNumber: string; code: string; ip?: string }) {
    const phoneNumberEither = PhoneNumber.create(command.phoneNumber);
    if (isLeft(phoneNumberEither)) return phoneNumberEither;

    const otpCodeEither = OtpCode.create(command.code);
    if (isLeft(otpCodeEither)) return otpCodeEither;

    return Right({
      phoneNumber: phoneNumberEither.value,
      otpCode: otpCodeEither.value,
      fingerPrint: FingerPrint.fromIp(command.ip ?? ''),
    });
  }

  private async mapResult(
    tx: Parameters<Parameters<TransactionHost['startTransaction']>[0]>[0],
    event:
      | { type: 'login_process.otp_expired' }
      | { type: 'login_process.otp_verify_failed' }
      | { type: 'login_process.blocked'; blockedUntil: Date }
      | NewRegistrationStartedEvent
      | LoginCompletedEvent,
    now: Date,
    registrationSessionId: string,
  ): Promise<Either<OtpExpiredError | InvalidOtpError | LoginBlockedError, VerifyOtpResult>> {
    switch (event.type) {
      case 'login_process.otp_expired':
        return Left(new OtpExpiredError());
      case 'login_process.otp_verify_failed':
        return Left(new InvalidOtpError());
      case 'login_process.blocked':
        return Left(new LoginBlockedError({ blockedUntil: event.blockedUntil.toISOString() }));
      case 'login_process.new_registration':
        return Right({ type: 'new_registration', registrationSessionId });
      case 'login_process.completed': {
        const tokenPair = await this.createSession(tx, event, now);
        return Right({ type: 'success', ...tokenPair });
      }
      default:
        assertNever(event);
    }
  }

  private async createSession(
    tx: Parameters<Parameters<TransactionHost['startTransaction']>[0]>[0],
    event: LoginCompletedEvent,
    now: Date,
  ): Promise<TokenPair> {
    const sessionId = this.idGenerator.generateSessionId();

    const createSessionCmd = whenLoginCompletedCreateSession(event, {
      sessionId,
      now,
      ttlMs: SESSION_TTL_MS,
    });

    const sessionResult = SessionEntity.create(null, createSessionCmd);
    if (isLeft(sessionResult)) throw new Error('Unexpected session creation failure');

    await this.sessionRepository.save(tx, sessionResult.value.state);

    const accessToken = this.jwtAccess.sign({
      userId: event.userId,
      role: event.role,
      sessionId: sessionResult.value.state.id,
    });

    const refreshToken = this.refreshTokens.sign({
      sessionId: sessionResult.value.state.id,
      userId: event.userId,
      type: 'refresh',
    });

    return { accessToken, refreshToken };
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { loginProcessApply } from '../../../domain/aggregates/login-process/apply.js';
import { registerDecide } from '../../../domain/aggregates/login-process/decide/register.js';
import { RegistractionError } from '../../../domain/aggregates/login-process/errors.js';
import { sessionApply } from '../../../domain/aggregates/session/apply.js';
import { sessionDecide } from '../../../domain/aggregates/session/decide.js';
import { userApply } from '../../../domain/aggregates/user/apply.js';
import { userDecide } from '../../../domain/aggregates/user/decide.js';
import { whenRegistrationCompletedCreateSession } from '../../../domain/policies/when-registration-completed-create-session.policy.js';
import { whenRegistrationCompletedCreateUser } from '../../../domain/policies/when-registration-completed-create-user.policy.js';
import { FullName } from '../../../domain/vo/full-name.js';
import {
  IdGenerator,
  JwtAccessService,
  LoginProcessRepository,
  type MediaRecord,
  RefreshTokenService,
  SessionRepository,
  UserRepository,
} from '../../ports.js';
import { createEventId } from '@/infra/ddd/event.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import type { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { FileId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class RegisterInteractor {
  public constructor(
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

  public async execute(command: {
    registrationSessionId: string;
    fullName: string;
    avatarMedia?: MediaRecord;
  }) {
    const fullNameEither = FullName.create(command.fullName);
    if (isLeft(fullNameEither)) return fullNameEither;

    const fullName = fullNameEither.value;
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.loginProcessRepository.findByRegistrationSessionId(
        tx,
        command.registrationSessionId,
      );

      if (!state || state.type !== 'NewRegistration') {
        return Left(new RegistractionError());
      }

      const eventEither = registerDecide(state, {
        type: 'Register',
        newUserId: this.idGenerator.generateUserId(),
        role: Role.default(),
        fullName,
        avatarId: command.avatarMedia ? FileId.raw(command.avatarMedia.key) : undefined,
        registrationSessionId: command.registrationSessionId,
        fingerPrint: state.fingerPrint,
        now,
        createEventId,
      });

      if (isLeft(eventEither)) return eventEither;

      const event = eventEither.value;
      const newState = loginProcessApply(state, event);
      await this.loginProcessRepository.save(tx, newState);

      // Policy: create user
      const createUserCmd = whenRegistrationCompletedCreateUser(event, { now });
      const userEventEither = userDecide(null, createUserCmd);
      if (isLeft(userEventEither)) throw new Error('Unexpected user creation failure');
      const userState = userApply(null, userEventEither.value);
      await this.userRepository.save(tx, userState);

      // Policy: create session
      const sessionId = this.idGenerator.generateSessionId();
      const createSessionCmd = whenRegistrationCompletedCreateSession(event, {
        sessionId,
        now,
        ttlMs: SESSION_TTL_MS,
      });
      const sessionEventEither = sessionDecide(null, createSessionCmd);
      if (isLeft(sessionEventEither)) throw new Error('Unexpected session creation failure');
      const sessionState = sessionApply(null, sessionEventEither.value);
      if (!sessionState) throw new Error('Unexpected null session state after creation');
      await this.sessionRepository.save(tx, sessionState);

      // Sign tokens
      const accessToken = this.jwtAccess.sign({
        userId: event.userId,
        role: event.role,
        sessionId: sessionState.id,
      });
      const refreshToken = this.refreshTokens.sign({
        sessionId: sessionState.id,
        userId: event.userId,
        type: 'refresh',
      });

      return Right({
        accessToken,
        refreshToken,
        userId: event.userId,
        sessionId: sessionState.id,
      });
    });
  }
}

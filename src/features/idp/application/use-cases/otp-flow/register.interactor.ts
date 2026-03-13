import { Inject, Injectable } from '@nestjs/common';

import { LoginProcessEntity } from '../../../domain/aggregates/login-process/entity.js';
import { RegistractionError } from '../../../domain/aggregates/login-process/errors.js';
import { SessionEntity } from '../../../domain/aggregates/session/entity.js';
import { UserEntity } from '../../../domain/aggregates/user/entity.js';
import { whenRegistrationCompletedCreateSession } from '../../../domain/policies/when-registration-completed-create-session.policy.js';
import { whenRegistrationCompletedCreateUser } from '../../../domain/policies/when-registration-completed-create-user.policy.js';
import { FullName } from '../../../domain/vo/full-name.js';
import {
  IdGenerator,
  JwtAccessService,
  LoginProcessRepository,
  RefreshTokenService,
  SessionRepository,
  UserRepository,
} from '../../ports.js';
import { createEventId } from '@/infra/ddd/event.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { FileId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo/role.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class RegisterInteractor {
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

  public async execute(command: {
    registrationSessionId: string;
    fullName: string;
    avatarId?: string;
    cityId: string;
    lat?: number;
    lng?: number;
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

      const lpResult = LoginProcessEntity.register(state, {
        type: 'Register',
        newUserId: this.idGenerator.generateUserId(),
        role: Role.default(),
        fullName,
        avatarId: command.avatarId ? FileId.raw(command.avatarId) : undefined,
        cityId: command.cityId,
        lat: command.lat,
        lng: command.lng,
        registrationSessionId: command.registrationSessionId,
        fingerPrint: state.fingerPrint,
        now,
        createEventId,
      });

      if (isLeft(lpResult)) return lpResult;

      const event = lpResult.value.event;
      await this.loginProcessRepository.save(tx, lpResult.value.state);

      // Policy: create user
      const createUserCmd = whenRegistrationCompletedCreateUser(event, { now });
      const userResult = UserEntity.create(null, createUserCmd);
      if (isLeft(userResult)) throw new Error('Unexpected user creation failure');
      await this.userRepository.save(tx, userResult.value.state);

      // Policy: create session
      const sessionId = this.idGenerator.generateSessionId();
      const createSessionCmd = whenRegistrationCompletedCreateSession(event, {
        sessionId,
        now,
        ttlMs: SESSION_TTL_MS,
      });
      const sessionResult = SessionEntity.create(null, createSessionCmd);
      if (isLeft(sessionResult)) throw new Error('Unexpected session creation failure');
      await this.sessionRepository.save(tx, sessionResult.value.state);

      // Sign tokens
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

      return Right({
        accessToken,
        refreshToken,
        userId: event.userId,
        sessionId: sessionResult.value.state.id,
      });
    });
  }
}

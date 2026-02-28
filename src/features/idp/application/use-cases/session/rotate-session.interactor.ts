import { Inject, Injectable } from '@nestjs/common';

import { sessionApply } from '../../../domain/aggregates/session/apply.js';
import { sessionDecide } from '../../../domain/aggregates/session/decide.js';
import {
  SessionExpiredError,
  SessionNotFoundError,
} from '../../../domain/aggregates/session/errors.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import {
  IdGenerator,
  JwtAccessService,
  RefreshTokenService,
  SessionRepository,
  UserRepository,
} from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { SessionId } from '@/kernel/domain/ids.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class RotateSessionInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    private readonly sessionRepository: SessionRepository,
    private readonly userRepository: UserRepository,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwtAccess: JwtAccessService,
    private readonly idGenerator: IdGenerator,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { refreshToken: string }) {
    const payload = this.refreshTokens.verify(command.refreshToken);
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.sessionRepository.findById(tx, SessionId.raw(payload.sessionId));

      if (!state) return Left(new SessionNotFoundError());

      if (state.expiresAt.getTime() < now.getTime()) {
        await this.sessionRepository.deleteById(tx, state.id);
        return Left(new SessionExpiredError());
      }

      const user = await this.userRepository.findById(tx, state.userId);
      if (!user) return Left(new UserNotFoundError());

      const eventEither = sessionDecide(state, {
        type: 'RotateSession',
        newId: this.idGenerator.generateSessionId(),
        userId: state.userId,
        now,
        ttlMs: SESSION_TTL_MS,
      });

      if (isLeft(eventEither)) return eventEither;

      const newState = sessionApply(state, eventEither.value);
      if (!newState) throw new Error('Unexpected null session state after rotation');

      await this.sessionRepository.deleteById(tx, state.id);
      await this.sessionRepository.save(tx, newState);

      const accessToken = this.jwtAccess.sign({
        userId: user.id,
        role: user.role,
        sessionId: newState.id,
      });

      const refreshToken = this.refreshTokens.sign({
        sessionId: newState.id,
        userId: user.id,
        type: 'refresh',
      });

      return Right({ accessToken, refreshToken });
    });
  }
}

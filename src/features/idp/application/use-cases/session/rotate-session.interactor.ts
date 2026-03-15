import { Inject, Injectable } from '@nestjs/common';

import { SessionEntity } from '../../../domain/aggregates/session/entity.js';
import {
  SessionExpiredError,
  SessionNotFoundError,
} from '../../../domain/aggregates/session/errors.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { parseDeviceName } from '../../../domain/vo/device-parser.js';
import type { SessionMeta } from '../../../domain/vo/session-meta.js';
import {
  GeoIpService,
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
    @Inject(GeoIpService)
    private readonly geoIp: GeoIpService,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { refreshToken: string; ip?: string; userAgent?: string }) {
    const payload = this.refreshTokens.verify(command.refreshToken);
    const now = this.clock.now();

    const geo = await this.geoIp.lookup(command.ip ?? '');
    const meta: SessionMeta = {
      ip: command.ip ?? '',
      city: geo.city,
      country: geo.country,
      deviceName: parseDeviceName(command.userAgent ?? ''),
    };

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.sessionRepository.findById(tx, SessionId.raw(payload.sessionId));

      if (!state) return Left(new SessionNotFoundError());

      if (state.expiresAt.getTime() < now.getTime()) {
        await this.sessionRepository.deleteById(tx, state.id);
        return Left(new SessionExpiredError());
      }

      const user = await this.userRepository.findById(tx, state.userId);
      if (!user) return Left(new UserNotFoundError());

      const result = SessionEntity.rotate(state, {
        type: 'RotateSession',
        newId: this.idGenerator.generateSessionId(),
        userId: state.userId,
        now,
        ttlMs: SESSION_TTL_MS,
        meta,
      });

      if (isLeft(result)) return result;

      await this.sessionRepository.deleteById(tx, state.id);
      await this.sessionRepository.save(tx, result.value.state);

      const accessToken = this.jwtAccess.sign({
        userId: user.id,
        role: user.role,
        sessionId: result.value.state.id,
      });

      const refreshToken = this.refreshTokens.sign({
        sessionId: result.value.state.id,
        userId: user.id,
        type: 'refresh',
      });

      return Right({ accessToken, refreshToken });
    });
  }
}

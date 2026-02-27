import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

import { RefreshTokenService } from '../../application/ports.js';
import type { RefreshTokenPayload } from '../../domain/aggregates/session/token.types.js';
import { RefreshToken } from '../../domain/vo/tokens.js';
import { MainConfigService } from '@/infra/config/service.js';

@Injectable()
export class NestJwtRefreshTokenService extends RefreshTokenService {
  private readonly secret: string;
  private readonly ttlSec: number;

  public constructor(config: MainConfigService) {
    super();
    this.secret = config.get('IDP_JWT_SECRET');
    this.ttlSec = config.get('IDP_REFRESH_TOKEN_TTL_SEC');
  }

  public sign(payload: RefreshTokenPayload): RefreshToken {
    const token = jwt.sign(
      { sub: payload.userId, sid: payload.sessionId, type: 'refresh' },
      this.secret,
      { expiresIn: this.ttlSec },
    );

    return RefreshToken.raw(token);
  }

  public verify(token: string): RefreshTokenPayload {
    const decoded = jwt.verify(token, this.secret) as {
      sub: string;
      sid: string;
      type: 'refresh';
    };

    return {
      userId: decoded.sub,
      sessionId: decoded.sid,
      type: 'refresh',
    };
  }
}

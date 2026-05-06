import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { MainConfigService } from '@/infra/config/service.js';
import type { UserId } from '@/kernel/domain/ids.js';

export type CentrifugoTokenInfo = {
  role: 'user' | 'admin';
};

/**
 * Выдаёт connection-JWT для клиента Centrifugo (HS256).
 * Секрет общий с Centrifugo (CENTRIFUGO_TOKEN_HMAC_SECRET).
 *
 * Формат: { sub: userId, exp: nowSec + ttl, info: { role } }.
 * Centrifugo проверяет подпись и attaches `user` к коннекту.
 */
@Injectable()
export class CentrifugoTokenService {
  public constructor(
    @Inject(MainConfigService) private readonly config: MainConfigService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  public issue(userId: UserId, info: CentrifugoTokenInfo): { token: string; expiresAt: Date } {
    const ttlSec = this.config.get('CENTRIFUGO_TOKEN_TTL_SEC');
    const secret = this.config.get('CENTRIFUGO_TOKEN_HMAC_SECRET');
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    const token = this.jwt.sign(
      { sub: userId as string, info },
      { secret, algorithm: 'HS256', expiresIn: ttlSec },
    );

    return { token, expiresAt };
  }
}

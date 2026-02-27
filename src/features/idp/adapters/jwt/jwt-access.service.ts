import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JwtAccessService } from '../../application/ports.js';
import { AccessToken } from '../../domain/vo/tokens.js';
import type { UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

@Injectable()
export class NestJwtAccessService extends JwtAccessService {
  public constructor(private readonly jwtService: JwtService) {
    super();
  }

  public sign(payload: { userId: UserId; role: Role; sessionId: string }): AccessToken {
    const token = this.jwtService.sign({
      sub: payload.userId,
      role: payload.role,
      sid: payload.sessionId,
    });

    return AccessToken.raw(token);
  }
}

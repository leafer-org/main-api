import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { JwtSessionStorage } from './jwt-session.storage.js';
import type { JwtUserPayload } from './jwt-user-payload.js';
import { SessionValidationPort } from '@/kernel/application/ports/session-validation.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(
    private readonly jwtService: JwtService,
    private readonly sessionStorage: JwtSessionStorage,
    private readonly sessionValidation: SessionValidationPort,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({ code: 'unauthorized' });
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; role: string; sid: string }>(token);

      const sessionId = SessionId.raw(payload.sid);
      const sessionExists = await this.sessionValidation.exists(NO_TRANSACTION, sessionId);

      if (!sessionExists) {
        throw new UnauthorizedException({ code: 'session_not_found' });
      }

      const userPayload: JwtUserPayload = {
        userId: UserId.raw(payload.sub),
        role: Role.raw(payload.role),
        sessionId,
      };

      (request as Request & { user: JwtUserPayload }).user = userPayload;
      this.sessionStorage.store.enterWith(userPayload);

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException({ code: 'unauthorized' });
    }
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return;

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return;

    return token;
  }
}

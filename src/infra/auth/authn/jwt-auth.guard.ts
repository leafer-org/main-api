import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';

import type { JwtUserPayload } from './jwt-user-payload.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { SessionValidationPort } from '@/kernel/application/ports/session-validation.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo/role.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(
    private readonly jwtService: JwtService,
    private readonly cls: ClsService,
    @Inject(SessionValidationPort)
    private readonly sessionValidation: SessionValidationPort,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

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
      this.cls.set('user', userPayload);

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

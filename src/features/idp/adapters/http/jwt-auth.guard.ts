import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

export type JwtUserPayload = {
  userId: UserId;
  role: Role;
  sessionId: SessionId;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(private readonly jwtService: JwtService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; role: string; sid: string }>(token);

      (request as Request & { user: JwtUserPayload }).user = {
        userId: UserId.raw(payload.sub),
        role: Role.raw(payload.role),
        sessionId: SessionId.raw(payload.sid),
      };

      return true;
    } catch {
      throw new UnauthorizedException();
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

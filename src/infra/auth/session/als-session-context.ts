import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { JwtUserPayload } from '../authn/jwt-user-payload.js';
import { SessionContext } from './session-context.js';

@Injectable()
export class AlsSessionContext extends SessionContext {
  public constructor(private readonly cls: ClsService) {
    super();
  }

  public getRole(): string {
    const payload = this.cls.get<JwtUserPayload>('user');
    if (!payload) {
      throw new Error('No session in current context. Was JwtAuthGuard applied?');
    }
    return payload.role as string;
  }
}

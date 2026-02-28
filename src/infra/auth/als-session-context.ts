import { Injectable } from '@nestjs/common';

import { JwtSessionStorage } from './jwt-session.storage.js';
import { SessionContext } from '@/infra/lib/authorization/session-context.js';

@Injectable()
export class AlsSessionContext extends SessionContext {
  public constructor(private readonly sessionStorage: JwtSessionStorage) {
    super();
  }

  public getRole(): string {
    const payload = this.sessionStorage.getOrThrow();
    return payload.role as string;
  }
}

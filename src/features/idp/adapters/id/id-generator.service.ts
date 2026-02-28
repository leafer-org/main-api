import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../application/ports.js';
import type { LoginProcessId } from '../../domain/aggregates/login-process/state.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class UuidIdGenerator extends IdGenerator {
  public generateLoginProcessId(): LoginProcessId {
    return randomUUID() as LoginProcessId;
  }

  public generateUserId(): UserId {
    return UserId.raw(randomUUID());
  }

  public generateSessionId(): SessionId {
    return SessionId.raw(randomUUID());
  }
}

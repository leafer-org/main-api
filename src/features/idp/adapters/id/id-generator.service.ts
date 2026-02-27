import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../application/ports.js';
import type { LoginProcessId } from '../../domain/aggregates/login-process/state.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class UuidIdGenerator extends IdGenerator {
  public generateLoginProcessId(): LoginProcessId {
    return randomUUID() as LoginProcessId;
  }

  public generateUserId(): UserId {
    return randomUUID() as UserId;
  }

  public generateSessionId(): SessionId {
    return randomUUID() as SessionId;
  }
}

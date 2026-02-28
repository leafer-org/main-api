import type { Transaction } from './tx-host.js';
import type { SessionId } from '@/kernel/domain/ids.js';

export abstract class SessionValidationPort {
  public abstract exists(tx: Transaction, sessionId: SessionId): Promise<boolean>;
}

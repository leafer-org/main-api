import type { UserId } from '@/kernel/domain/ids.js';

export abstract class UserLookupPort {
  public abstract findByPhone(phone: string): Promise<{ userId: UserId } | null>;
}

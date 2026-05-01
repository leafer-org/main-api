import type { UserId } from '@/kernel/domain/ids.js';

export type UserSummary = {
  userId: UserId;
  fullName: string;
  phone: string;
  role: string;
};

export abstract class UserLookupPort {
  public abstract findByPhone(phone: string): Promise<{ userId: UserId } | null>;
  public abstract findByIds(ids: UserId[]): Promise<UserSummary[]>;
}

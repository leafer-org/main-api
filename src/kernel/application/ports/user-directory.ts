import type { MediaId, UserId } from '@/kernel/domain/ids.js';

export type UserDirectoryView = {
  userId: UserId;
  fullName: string;
  avatarMediaId: MediaId | null;
  cityId: string;
  lat: number | null;
  lng: number | null;
  role: string;
  phoneNumber: string;
  blockedAt: Date | null;
  blockReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class UserDirectoryPort {
  public abstract findById(id: UserId): Promise<UserDirectoryView | null>;
  public abstract findByIds(ids: readonly UserId[]): Promise<UserDirectoryView[]>;
}

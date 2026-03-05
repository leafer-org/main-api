import type { FileId, OwnerId } from '@/kernel/domain/ids.js';

export type OwnerReadModel = {
  ownerId: OwnerId;
  ownerType: 'organization' | 'user';
  name: string;
  avatarId: FileId | null;
  rating: number | null;
  reviewCount: number;
  updatedAt: Date;
};

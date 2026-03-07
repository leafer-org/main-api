import type { OrganizationId, ItemId } from '@/kernel/domain/ids.js';

export type PostRankingCandidate = {
  itemId: ItemId;
  ownerId: OrganizationId;
  nextEventDate: Date | null;
  hasSchedule: boolean;
};

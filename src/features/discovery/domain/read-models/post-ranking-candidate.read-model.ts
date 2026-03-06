import type { OwnerId, ServiceId } from '@/kernel/domain/ids.js';

export type PostRankingCandidate = {
  itemId: ServiceId;
  ownerId: OwnerId;
  nextEventDate: Date | null;
  hasSchedule: boolean;
};

import { OrganizationId } from '@/kernel/domain/ids.js';

import type { ItemReadModel } from '../read-models/item.read-model.js';
import type { PostRankingCandidate } from '../read-models/post-ranking-candidate.read-model.js';

export function toRankingCandidate(item: ItemReadModel): PostRankingCandidate {
  const dates = item.eventDateTime?.dates;
  const futureDate = dates
    ?.filter((d) => d.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    itemId: item.itemId,
    ownerId: item.owner
      ? OrganizationId.raw(item.owner.organizationId)
      : ('' as PostRankingCandidate['ownerId']),
    nextEventDate: futureDate ?? null,
    hasSchedule: (item.schedule?.entries.length ?? 0) > 0,
  };
}

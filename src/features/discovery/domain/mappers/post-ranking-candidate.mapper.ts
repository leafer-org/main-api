import type { PostRankingCandidate } from '../read-models/post-ranking-candidate.read-model.js';
import type { ItemReadModel } from '../read-models/item.read-model.js';

export function toRankingCandidate(item: ItemReadModel): PostRankingCandidate {
  const dates = item.eventDateTime?.dates;
  const futureDate = dates
    ?.filter((d) => d.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    itemId: item.itemId,
    ownerId: item.owner?.ownerId ?? ('' as PostRankingCandidate['ownerId']),
    nextEventDate: futureDate ?? null,
    hasSchedule: (item.schedule?.entries.length ?? 0) > 0,
  };
}

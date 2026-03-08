import type { OrganizationId, ItemId } from '@/kernel/domain/ids.js';

/**
 * Лёгкие метаданные для пост-ранкинга без загрузки полного ItemReadModel.
 * Используется в GetCategoryItems для ранкинга до 500 кандидатов.
 */
export type PostRankingCandidate = {
  itemId: ItemId;
  ownerId: OrganizationId;
  nextEventDate: Date | null;
  hasSchedule: boolean;
};

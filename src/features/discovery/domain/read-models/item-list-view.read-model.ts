import type { ItemPayment } from './item.read-model.js';
import type { CategoryId, MediaId, ItemId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

/**
 * Card-enrichment-поля — подмешиваются по `widgetSettings.showOnCard` в ItemType.
 * Все опциональные/nullable. См. discovery-feed.spec → card-enrichment.
 */
export type ItemCardEnrichment = {
  eventDateTime: string | null;
  nextScheduleSlot: { dayOfWeek: number; startTime: string; endTime: string } | null;
  distanceKm: number | null;
  cardAgeGroup: AgeGroupOption | null;
};

export const EMPTY_CARD_ENRICHMENT: ItemCardEnrichment = {
  eventDateTime: null,
  nextScheduleSlot: null,
  distanceKm: null,
  cardAgeGroup: null,
};

/** Карточка товара для списков/ленты. Проекция ItemReadModel через {@link toListView}. */
export type ItemListView = {
  itemId: ItemId;
  typeId: TypeId;
  title: string;
  description: string | null;
  media: MediaItem[];
  hasVideo: boolean;
  price: ItemPayment | null;
  rating: number | null;
  reviewCount: number;
  owner: { name: string; avatarId: MediaId | null } | null;
  location: { cityId: string; address: string | null } | null;
  categoryIds: CategoryId[];
} & ItemCardEnrichment;

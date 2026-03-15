import type { ItemPayment } from './item.read-model.js';
import type { CategoryId, MediaId, ItemId, TypeId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

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
};

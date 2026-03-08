import type { ItemPayment } from './item.read-model.js';
import type { CategoryId, FileId, ItemId, TypeId } from '@/kernel/domain/ids.js';

/** Карточка товара для списков/ленты. Проекция ItemReadModel через {@link toListView}. */
export type ItemListView = {
  itemId: ItemId;
  typeId: TypeId;
  title: string;
  description: string | null;
  imageId: FileId | null;
  price: ItemPayment | null;
  rating: number | null;
  reviewCount: number;
  owner: { name: string; avatarId: FileId | null } | null;
  location: { cityId: string; address: string | null } | null;
  categoryIds: CategoryId[];
};

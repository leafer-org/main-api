import type {
  CategoryAttribute,
  CategoryPublishedEvent,
} from '@/kernel/domain/events/category.events.js';
import type { CategoryId, MediaId, TypeId } from '@/kernel/domain/ids.js';

/**
 * Узел дерева категорий (неограниченная вложенность).
 * - `ancestorIds` — путь от корня, для показа товара в родительских категориях.
 * - `attributes` — JSONB, наследуются дочерними категориями для построения фильтров.
 * - `allowedTypeIds` — ограничивает допустимые типы товаров в категории.
 * Товар может принадлежать нескольким категориям (все должны допускать его тип).
 */
export type CategoryReadModel = {
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: MediaId;
  order: number;
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];
  attributes: CategoryAttribute[];
  createdAt: Date;
  updatedAt: Date;
};

export function projectCategory(event: CategoryPublishedEvent): CategoryReadModel {
  return {
    categoryId: event.categoryId,
    parentCategoryId: event.parentCategoryId,
    name: event.name,
    iconId: event.iconId,
    order: event.order,
    allowedTypeIds: event.allowedTypeIds,
    ancestorIds: event.ancestorIds,
    attributes: event.attributes,
    createdAt: event.publishedAt,
    updatedAt: event.publishedAt,
  };
}

import type { CategoryPublishedEvent } from '@/kernel/domain/events/category.events.js';
import type { CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';

export type CategoryReadModel = {
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];
  createdAt: Date;
  updatedAt: Date;
};

export function projectCategory(event: CategoryPublishedEvent): CategoryReadModel {
  return {
    categoryId: event.categoryId,
    parentCategoryId: event.parentCategoryId,
    name: event.name,
    iconId: event.iconId,
    allowedTypeIds: event.allowedTypeIds,
    ancestorIds: event.ancestorIds,
    createdAt: event.publishedAt,
    updatedAt: event.publishedAt,
  };
}

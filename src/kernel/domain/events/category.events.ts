import type { CategoryId, FileId, TypeId } from '../ids.js';
import type { AgeGroup } from '../vo/age-group.js';
import type { CategoryAttribute } from '../vo/category-attribute.js';

export type { CategoryAttribute } from '../vo/category-attribute.js';

export type CategoryPublishedEvent = {
  id: string;
  type: 'category.published';
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId;
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];
  attributes: CategoryAttribute[];
  ageGroups: AgeGroup[];
  republished: boolean;
  publishedAt: Date;
};

export type CategoryUnpublishedEvent = {
  id: string;
  type: 'category.unpublished';
  categoryId: CategoryId;
  unpublishedAt: Date;
};

export type CategoryIntegrationEvent = CategoryPublishedEvent | CategoryUnpublishedEvent;

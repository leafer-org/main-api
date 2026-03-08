import type { AttributeId, CategoryId, FileId, TypeId } from '../ids.js';
import type { AttributeSchema } from '../vo/attribute.js';

export type CategoryAttribute = {
  attributeId: AttributeId;
  name: string;
  required: boolean;
  schema: AttributeSchema;
};

export type CategoryPublishedEvent = {
  id: string;
  type: 'category.published';
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];
  attributes: CategoryAttribute[];
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

import type { CategoryStatus } from './entity.js';
import type { AttributeId, CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

export type CategoryCreatedEvent = {
  type: 'category.created';
  id: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  createdAt: Date;
};

export type CategoryUpdatedEvent = {
  type: 'category.updated';
  name: string;
  iconId: FileId | null;
  parentCategoryId: CategoryId | null;
  allowedTypeIds: TypeId[];
  updatedAt: Date;
};

export type CategoryPublishedEvent = {
  type: 'category.published';
  previousStatus: CategoryStatus;
  publishedAt: Date;
};

export type CategoryUnpublishedEvent = {
  type: 'category.unpublished';
  unpublishedAt: Date;
};

export type CategoryAttributeAddedEvent = {
  type: 'category.attribute-added';
  attributeId: AttributeId;
  name: string;
  required: boolean;
  schema: AttributeSchema;
  updatedAt: Date;
};

export type CategoryAttributeRemovedEvent = {
  type: 'category.attribute-removed';
  attributeId: AttributeId;
  updatedAt: Date;
};

export type CategoryEvent =
  | CategoryCreatedEvent
  | CategoryUpdatedEvent
  | CategoryPublishedEvent
  | CategoryUnpublishedEvent
  | CategoryAttributeAddedEvent
  | CategoryAttributeRemovedEvent;

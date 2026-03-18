import type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';
import type { AttributeId, CategoryId, MediaId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/age-group.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

export type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';

export type CategoryCreatedEvent = {
  type: 'category.created';
  id: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: MediaId;
  order: number;
  allowedTypeIds: TypeId[];
  ageGroups: AgeGroup[];
  createdAt: Date;
};

export type CategoryUpdatedEvent = {
  type: 'category.updated';
  name: string;
  iconId: MediaId;
  order: number;
  parentCategoryId: CategoryId | null;
  allowedTypeIds: TypeId[];
  ageGroups: AgeGroup[];
  updatedAt: Date;
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

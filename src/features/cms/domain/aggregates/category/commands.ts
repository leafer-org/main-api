import type { AttributeId, CategoryId, MediaId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/age-group.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

export type CreateCategoryCommand = {
  type: 'CreateCategory';
  id: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: MediaId;
  allowedTypeIds: TypeId[];
  ageGroups: AgeGroup[];
  parentAllowedTypeIds: TypeId[] | null;
  parentAgeGroups: AgeGroup[] | null;
  now: Date;
};

export type UpdateCategoryCommand = {
  type: 'UpdateCategory';
  name: string;
  iconId: MediaId;
  parentCategoryId: CategoryId | null;
  allowedTypeIds: TypeId[];
  ageGroups: AgeGroup[];
  parentAllowedTypeIds: TypeId[] | null;
  parentAgeGroups: AgeGroup[] | null;
  now: Date;
};

export type CategoryAncestorData = {
  attributes: {
    attributeId: AttributeId;
    name: string;
    required: boolean;
    schema: AttributeSchema;
  }[];
};

export type PublishCategoryCommand = {
  type: 'PublishCategory';
  eventId: string;
  ancestorIds: CategoryId[];
  ancestors: CategoryAncestorData[];
  now: Date;
};

export type UnpublishCategoryCommand = {
  type: 'UnpublishCategory';
  eventId: string;
  now: Date;
};

export type AddAttributeCommand = {
  type: 'AddAttribute';
  attributeId: AttributeId;
  name: string;
  required: boolean;
  schema: AttributeSchema;
  now: Date;
};

export type RemoveAttributeCommand = {
  type: 'RemoveAttribute';
  attributeId: AttributeId;
  now: Date;
};

export type CategoryCommand =
  | CreateCategoryCommand
  | UpdateCategoryCommand
  | PublishCategoryCommand
  | UnpublishCategoryCommand
  | AddAttributeCommand
  | RemoveAttributeCommand;

import type { AttributeId, CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

export type CreateCategoryCommand = {
  type: 'CreateCategory';
  id: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  parentAllowedTypeIds: TypeId[] | null;
  now: Date;
};

export type UpdateCategoryCommand = {
  type: 'UpdateCategory';
  name: string;
  iconId: FileId | null;
  parentCategoryId: CategoryId | null;
  allowedTypeIds: TypeId[];
  parentAllowedTypeIds: TypeId[] | null;
  now: Date;
};

export type PublishCategoryCommand = {
  type: 'PublishCategory';
  now: Date;
};

export type UnpublishCategoryCommand = {
  type: 'UnpublishCategory';
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

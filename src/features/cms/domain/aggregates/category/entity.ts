import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import type { CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';
import type { CategoryAttribute } from '@/kernel/domain/vo/category-attribute.js';
import type {
  AddAttributeCommand,
  CreateCategoryCommand,
  PublishCategoryCommand,
  RemoveAttributeCommand,
  UnpublishCategoryCommand,
  UpdateCategoryCommand,
} from './commands.js';
import {
  AttributeAlreadyAssignedError,
  AttributeNotAssignedError,
  CategoryNotPublishedError,
  InvalidAllowedTypeIdsError,
} from './errors.js';
import type {
  CategoryAttributeAddedEvent,
  CategoryAttributeRemovedEvent,
  CategoryCreatedEvent,
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
  CategoryUpdatedEvent,
} from './events.js';

export type CategoryStatus = 'draft' | 'published' | 'unpublished';

export type CategoryEntity = EntityState<{
  id: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  attributes: CategoryAttribute[];
  status: CategoryStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

function validateAllowedTypeIds(
  allowedTypeIds: string[],
  parentAllowedTypeIds: string[] | null,
): Either<InvalidAllowedTypeIdsError, void> {
  if (!parentAllowedTypeIds) return Right(undefined);

  const parentSet = new Set(parentAllowedTypeIds);
  const invalid = allowedTypeIds.filter((id) => !parentSet.has(id));

  if (invalid.length > 0) {
    return Left(new InvalidAllowedTypeIdsError({ invalidTypeIds: invalid }));
  }

  return Right(undefined);
}

export const CategoryEntity = {
  create(
    cmd: CreateCategoryCommand,
  ): Either<InvalidAllowedTypeIdsError, { state: CategoryEntity; event: CategoryCreatedEvent }> {
    const typeValidation = validateAllowedTypeIds(
      cmd.allowedTypeIds as string[],
      cmd.parentAllowedTypeIds as string[] | null,
    );
    if (isLeft(typeValidation)) return typeValidation;

    const event: CategoryCreatedEvent = {
      type: 'category.created',
      id: cmd.id,
      parentCategoryId: cmd.parentCategoryId,
      name: cmd.name,
      iconId: cmd.iconId,
      allowedTypeIds: cmd.allowedTypeIds,
      createdAt: cmd.now,
    };

    const state: CategoryEntity = {
      id: event.id,
      parentCategoryId: event.parentCategoryId,
      name: event.name,
      iconId: event.iconId,
      allowedTypeIds: event.allowedTypeIds,
      attributes: [],
      status: 'draft',
      publishedAt: null,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    };

    return Right({ state, event });
  },

  update(
    state: CategoryEntity,
    cmd: UpdateCategoryCommand,
  ): Either<InvalidAllowedTypeIdsError, { state: CategoryEntity; event: CategoryUpdatedEvent }> {
    const typeValidation = validateAllowedTypeIds(
      cmd.allowedTypeIds as string[],
      cmd.parentAllowedTypeIds as string[] | null,
    );
    if (isLeft(typeValidation)) return typeValidation;

    const event: CategoryUpdatedEvent = {
      type: 'category.updated',
      name: cmd.name,
      iconId: cmd.iconId,
      parentCategoryId: cmd.parentCategoryId,
      allowedTypeIds: cmd.allowedTypeIds,
      updatedAt: cmd.now,
    };

    const newState: CategoryEntity = {
      ...state,
      name: event.name,
      iconId: event.iconId,
      parentCategoryId: event.parentCategoryId,
      allowedTypeIds: event.allowedTypeIds,
      updatedAt: event.updatedAt,
    };

    return Right({ state: newState, event });
  },

  publish(
    state: CategoryEntity,
    cmd: PublishCategoryCommand,
  ): Either<never, { state: CategoryEntity; event: CategoryPublishedEvent }> {
    const event: CategoryPublishedEvent = {
      type: 'category.published',
      previousStatus: state.status,
      publishedAt: cmd.now,
    };

    const newState: CategoryEntity = {
      ...state,
      status: 'published',
      publishedAt: event.publishedAt,
      updatedAt: event.publishedAt,
    };

    return Right({ state: newState, event });
  },

  unpublish(
    state: CategoryEntity,
    cmd: UnpublishCategoryCommand,
  ): Either<CategoryNotPublishedError, { state: CategoryEntity; event: CategoryUnpublishedEvent }> {
    if (state.status !== 'published') return Left(new CategoryNotPublishedError());

    const event: CategoryUnpublishedEvent = {
      type: 'category.unpublished',
      unpublishedAt: cmd.now,
    };

    const newState: CategoryEntity = {
      ...state,
      status: 'unpublished',
      updatedAt: event.unpublishedAt,
    };

    return Right({ state: newState, event });
  },

  addAttribute(
    state: CategoryEntity,
    cmd: AddAttributeCommand,
  ): Either<AttributeAlreadyAssignedError, { state: CategoryEntity; event: CategoryAttributeAddedEvent }> {
    const exists = state.attributes.some(
      (a) => (a.attributeId as string) === (cmd.attributeId as string),
    );
    if (exists) return Left(new AttributeAlreadyAssignedError());

    const event: CategoryAttributeAddedEvent = {
      type: 'category.attribute-added',
      attributeId: cmd.attributeId,
      name: cmd.name,
      required: cmd.required,
      schema: cmd.schema,
      updatedAt: cmd.now,
    };

    const newState: CategoryEntity = {
      ...state,
      attributes: [
        ...state.attributes,
        {
          attributeId: event.attributeId,
          name: event.name,
          required: event.required,
          schema: event.schema,
        },
      ],
      updatedAt: event.updatedAt,
    };

    return Right({ state: newState, event });
  },

  removeAttribute(
    state: CategoryEntity,
    cmd: RemoveAttributeCommand,
  ): Either<AttributeNotAssignedError, { state: CategoryEntity; event: CategoryAttributeRemovedEvent }> {
    const exists = state.attributes.some(
      (a) => (a.attributeId as string) === (cmd.attributeId as string),
    );
    if (!exists) return Left(new AttributeNotAssignedError());

    const event: CategoryAttributeRemovedEvent = {
      type: 'category.attribute-removed',
      attributeId: cmd.attributeId,
      updatedAt: cmd.now,
    };

    const newState: CategoryEntity = {
      ...state,
      attributes: state.attributes.filter(
        (a) => (a.attributeId as string) !== (cmd.attributeId as string),
      ),
      updatedAt: event.updatedAt,
    };

    return Right({ state: newState, event });
  },
};

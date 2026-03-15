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
  EmptyAgeGroupsError,
  EmptyAllowedTypeIdsError,
  InvalidAgeGroupsError,
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
import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import type { CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/age-group.js';
import { CategoryAttribute } from '@/kernel/domain/vo/category-attribute.js';

export type CategoryStatus = 'draft' | 'published' | 'unpublished';

export type CategoryEntity = EntityState<{
  id: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId;
  allowedTypeIds: TypeId[];
  ageGroups: AgeGroup[];
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

function validateAgeGroups(
  ageGroups: string[],
  parentAgeGroups: string[] | null,
): Either<InvalidAgeGroupsError, void> {
  if (!parentAgeGroups) return Right(undefined);

  const parentSet = new Set(parentAgeGroups);
  const invalid = ageGroups.filter((g) => !parentSet.has(g));

  if (invalid.length > 0) {
    return Left(new InvalidAgeGroupsError({ invalidAgeGroups: invalid }));
  }

  return Right(undefined);
}

export const CategoryEntity = {
  create(
    cmd: CreateCategoryCommand,
  ): Either<
    InvalidAllowedTypeIdsError | InvalidAgeGroupsError | EmptyAllowedTypeIdsError | EmptyAgeGroupsError,
    { state: CategoryEntity; event: CategoryCreatedEvent }
  > {
    if (cmd.allowedTypeIds.length === 0) return Left(new EmptyAllowedTypeIdsError());
    if (cmd.ageGroups.length === 0) return Left(new EmptyAgeGroupsError());

    const typeValidation = validateAllowedTypeIds(
      cmd.allowedTypeIds as string[],
      cmd.parentAllowedTypeIds as string[] | null,
    );
    if (isLeft(typeValidation)) return typeValidation;

    const ageValidation = validateAgeGroups(
      cmd.ageGroups as string[],
      cmd.parentAgeGroups as string[] | null,
    );
    if (isLeft(ageValidation)) return ageValidation;

    const event: CategoryCreatedEvent = {
      type: 'category.created',
      id: cmd.id,
      parentCategoryId: cmd.parentCategoryId,
      name: cmd.name,
      iconId: cmd.iconId,
      allowedTypeIds: cmd.allowedTypeIds,
      ageGroups: cmd.ageGroups,
      createdAt: cmd.now,
    };

    const state: CategoryEntity = {
      id: event.id,
      parentCategoryId: event.parentCategoryId,
      name: event.name,
      iconId: event.iconId,
      allowedTypeIds: event.allowedTypeIds,
      ageGroups: event.ageGroups,
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
  ): Either<
    InvalidAllowedTypeIdsError | InvalidAgeGroupsError | EmptyAllowedTypeIdsError | EmptyAgeGroupsError,
    { state: CategoryEntity; event: CategoryUpdatedEvent }
  > {
    if (cmd.allowedTypeIds.length === 0) return Left(new EmptyAllowedTypeIdsError());
    if (cmd.ageGroups.length === 0) return Left(new EmptyAgeGroupsError());

    const typeValidation = validateAllowedTypeIds(
      cmd.allowedTypeIds as string[],
      cmd.parentAllowedTypeIds as string[] | null,
    );
    if (isLeft(typeValidation)) return typeValidation;

    const ageValidation = validateAgeGroups(
      cmd.ageGroups as string[],
      cmd.parentAgeGroups as string[] | null,
    );
    if (isLeft(ageValidation)) return ageValidation;

    const event: CategoryUpdatedEvent = {
      type: 'category.updated',
      name: cmd.name,
      iconId: cmd.iconId,
      parentCategoryId: cmd.parentCategoryId,
      allowedTypeIds: cmd.allowedTypeIds,
      ageGroups: cmd.ageGroups,
      updatedAt: cmd.now,
    };

    const newState: CategoryEntity = {
      ...state,
      name: event.name,
      iconId: event.iconId,
      parentCategoryId: event.parentCategoryId,
      allowedTypeIds: event.allowedTypeIds,
      ageGroups: event.ageGroups,
      updatedAt: event.updatedAt,
    };

    return Right({ state: newState, event });
  },

  publish(
    state: CategoryEntity,
    cmd: PublishCategoryCommand,
  ): Either<never, { state: CategoryEntity; event: CategoryPublishedEvent }> {
    const mergedAttributes = CategoryAttribute.mergeWithAncestors(
      { attributes: state.attributes },
      cmd.ancestors,
    );

    const event: CategoryPublishedEvent = {
      id: cmd.eventId,
      type: 'category.published',
      categoryId: state.id,
      parentCategoryId: state.parentCategoryId,
      name: state.name,
      iconId: state.iconId,
      allowedTypeIds: state.allowedTypeIds,
      ageGroups: state.ageGroups,
      ancestorIds: cmd.ancestorIds,
      attributes: mergedAttributes.map((a) => ({
        attributeId: a.attributeId,
        name: a.name,
        required: true,
        schema: a.schema,
      })),
      republished: state.status !== 'draft',
      publishedAt: cmd.now,
    };

    const newState: CategoryEntity = {
      ...state,
      status: 'published',
      publishedAt: cmd.now,
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  unpublish(
    state: CategoryEntity,
    cmd: UnpublishCategoryCommand,
  ): Either<CategoryNotPublishedError, { state: CategoryEntity; event: CategoryUnpublishedEvent }> {
    if (state.status !== 'published') return Left(new CategoryNotPublishedError());

    const event: CategoryUnpublishedEvent = {
      id: cmd.eventId,
      type: 'category.unpublished',
      categoryId: state.id,
      unpublishedAt: cmd.now,
    };

    const newState: CategoryEntity = {
      ...state,
      status: 'unpublished',
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  addAttribute(
    state: CategoryEntity,
    cmd: AddAttributeCommand,
  ): Either<
    AttributeAlreadyAssignedError,
    { state: CategoryEntity; event: CategoryAttributeAddedEvent }
  > {
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
  ): Either<
    AttributeNotAssignedError,
    { state: CategoryEntity; event: CategoryAttributeRemovedEvent }
  > {
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

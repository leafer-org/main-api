import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';
import type { CreateItemTypeCommand, UpdateItemTypeCommand } from './commands.js';
import { InvalidRequiredWidgetTypesError, ItemTypeAlreadyExistsError } from './errors.js';
import type { ItemTypeCreatedEvent, ItemTypeUpdatedEvent } from './events.js';

export type ItemTypeEntity = EntityState<{
  id: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  createdAt: Date;
  updatedAt: Date;
}>;

function validateRequiredWidgetTypes(
  available: string[],
  required: string[],
): Either<InvalidRequiredWidgetTypesError, void> {
  const availableSet = new Set(available);
  const invalid = required.filter((t) => !availableSet.has(t));

  if (invalid.length > 0) {
    return Left(new InvalidRequiredWidgetTypesError({ invalidTypes: invalid }));
  }

  return Right(undefined);
}

type ItemTypeDecideError = ItemTypeAlreadyExistsError | InvalidRequiredWidgetTypesError;

export const ItemTypeEntity = {
  create(
    cmd: CreateItemTypeCommand,
  ): Either<ItemTypeDecideError, { state: ItemTypeEntity; event: ItemTypeCreatedEvent }> {
    const validation = validateRequiredWidgetTypes(cmd.availableWidgetTypes, cmd.requiredWidgetTypes);
    if (validation.type === 'left') return validation;

    const event: ItemTypeCreatedEvent = {
      type: 'item-type.created',
      id: cmd.id,
      name: cmd.name,
      availableWidgetTypes: cmd.availableWidgetTypes,
      requiredWidgetTypes: cmd.requiredWidgetTypes,
      createdAt: cmd.now,
    };

    const state: ItemTypeEntity = {
      id: event.id,
      name: event.name,
      availableWidgetTypes: event.availableWidgetTypes,
      requiredWidgetTypes: event.requiredWidgetTypes,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    };

    return Right({ state, event });
  },

  update(
    state: ItemTypeEntity,
    cmd: UpdateItemTypeCommand,
  ): Either<ItemTypeDecideError, { state: ItemTypeEntity; event: ItemTypeUpdatedEvent }> {
    const validation = validateRequiredWidgetTypes(cmd.availableWidgetTypes, cmd.requiredWidgetTypes);
    if (validation.type === 'left') return validation;

    const event: ItemTypeUpdatedEvent = {
      type: 'item-type.updated',
      name: cmd.name,
      availableWidgetTypes: cmd.availableWidgetTypes,
      requiredWidgetTypes: cmd.requiredWidgetTypes,
      updatedAt: cmd.now,
    };

    const newState: ItemTypeEntity = {
      ...state,
      name: event.name,
      availableWidgetTypes: event.availableWidgetTypes,
      requiredWidgetTypes: event.requiredWidgetTypes,
      updatedAt: event.updatedAt,
    };

    return Right({ state: newState, event });
  },
};

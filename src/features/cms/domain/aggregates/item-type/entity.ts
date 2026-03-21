import type { CreateItemTypeCommand, UpdateItemTypeCommand } from './commands.js';
import { DuplicateWidgetSettingsError, ItemTypeAlreadyExistsError } from './errors.js';
import type { ItemTypeCreatedEvent, ItemTypeUpdatedEvent } from './events.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

export type ItemTypeEntity = EntityState<{
  id: TypeId;
  name: string;
  widgetSettings: WidgetSettings[];
  createdAt: Date;
  updatedAt: Date;
}>;

function validateWidgetSettings(
  settings: WidgetSettings[],
): Either<DuplicateWidgetSettingsError, void> {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const s of settings) {
    if (seen.has(s.type)) duplicates.push(s.type);
    seen.add(s.type);
  }

  if (duplicates.length > 0) {
    return Left(new DuplicateWidgetSettingsError({ duplicateTypes: duplicates }));
  }

  return Right(undefined);
}

type ItemTypeDecideError = ItemTypeAlreadyExistsError | DuplicateWidgetSettingsError;

export const ItemTypeEntity = {
  create(
    cmd: CreateItemTypeCommand,
  ): Either<ItemTypeDecideError, { state: ItemTypeEntity; event: ItemTypeCreatedEvent }> {
    const validation = validateWidgetSettings(cmd.widgetSettings);
    if (validation.type === 'left') return validation;

    const event: ItemTypeCreatedEvent = {
      type: 'item-type.created',
      id: cmd.id,
      name: cmd.name,
      widgetSettings: cmd.widgetSettings,
      createdAt: cmd.now,
    };

    const state: ItemTypeEntity = {
      id: event.id,
      name: event.name,
      widgetSettings: event.widgetSettings,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    };

    return Right({ state, event });
  },

  update(
    state: ItemTypeEntity,
    cmd: UpdateItemTypeCommand,
  ): Either<ItemTypeDecideError, { state: ItemTypeEntity; event: ItemTypeUpdatedEvent }> {
    const validation = validateWidgetSettings(cmd.widgetSettings);
    if (validation.type === 'left') return validation;

    const event: ItemTypeUpdatedEvent = {
      type: 'item-type.updated',
      name: cmd.name,
      widgetSettings: cmd.widgetSettings,
      updatedAt: cmd.now,
    };

    const newState: ItemTypeEntity = {
      ...state,
      name: event.name,
      widgetSettings: event.widgetSettings,
      updatedAt: event.updatedAt,
    };

    return Right({ state: newState, event });
  },
};

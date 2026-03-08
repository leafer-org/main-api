import type { ItemTypeCreatedEvent, ItemTypeUpdatedEvent } from '@/kernel/domain/events/item-type.events.js';
import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

/** Тип товара. Определяет доступные и обязательные виджеты. Создаётся динамически через админку. */
export type ItemTypeReadModel = {
  typeId: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  createdAt: Date;
  updatedAt: Date;
};

export function projectItemType(event: ItemTypeCreatedEvent | ItemTypeUpdatedEvent): ItemTypeReadModel {
  const timestamp = event.type === 'item-type.created' ? event.createdAt : event.updatedAt;
  return {
    typeId: event.typeId,
    name: event.name,
    availableWidgetTypes: event.availableWidgetTypes,
    requiredWidgetTypes: event.requiredWidgetTypes,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

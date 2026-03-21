import type {
  ItemTypeCreatedEvent,
  ItemTypeUpdatedEvent,
} from '@/kernel/domain/events/item-type.events.js';
import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

/** Тип товара. Определяет настройки виджетов. Создаётся динамически через админку. */
export type ItemTypeReadModel = {
  typeId: TypeId;
  name: string;
  widgetSettings: WidgetSettings[];
  createdAt: Date;
  updatedAt: Date;
};

export function projectItemType(
  event: ItemTypeCreatedEvent | ItemTypeUpdatedEvent,
): ItemTypeReadModel {
  const timestamp = event.type === 'item-type.created' ? event.createdAt : event.updatedAt;
  return {
    typeId: event.typeId,
    name: event.name,
    widgetSettings: event.widgetSettings,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

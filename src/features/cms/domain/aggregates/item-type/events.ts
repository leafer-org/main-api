import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

export type ItemTypeCreatedEvent = {
  type: 'item-type.created';
  id: TypeId;
  name: string;
  widgetSettings: WidgetSettings[];
  createdAt: Date;
};

export type ItemTypeUpdatedEvent = {
  type: 'item-type.updated';
  name: string;
  widgetSettings: WidgetSettings[];
  updatedAt: Date;
};

export type ItemTypeEvent = ItemTypeCreatedEvent | ItemTypeUpdatedEvent;

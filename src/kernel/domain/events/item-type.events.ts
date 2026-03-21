import type { TypeId } from '../ids.js';
import type { WidgetSettings } from '../vo/widget-settings.js';

export type ItemTypeCreatedEvent = {
  id: string;
  type: 'item-type.created';
  typeId: TypeId;
  name: string;
  label: string;
  widgetSettings: WidgetSettings[];
  createdAt: Date;
};

export type ItemTypeUpdatedEvent = {
  id: string;
  type: 'item-type.updated';
  typeId: TypeId;
  name: string;
  label: string;
  widgetSettings: WidgetSettings[];
  updatedAt: Date;
};

export type ItemTypeIntegrationEvent = ItemTypeCreatedEvent | ItemTypeUpdatedEvent;

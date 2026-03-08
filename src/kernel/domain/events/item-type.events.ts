import type { TypeId } from '../ids.js';
import type { WidgetType } from '../vo/widget.js';

export type ItemTypeCreatedEvent = {
  id: string;
  type: 'item-type.created';
  typeId: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  createdAt: Date;
};

export type ItemTypeUpdatedEvent = {
  id: string;
  type: 'item-type.updated';
  typeId: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  updatedAt: Date;
};

export type ItemTypeIntegrationEvent = ItemTypeCreatedEvent | ItemTypeUpdatedEvent;

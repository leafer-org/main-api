import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

export type ItemTypeCreatedEvent = {
  type: 'item-type.created';
  id: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  createdAt: Date;
};

export type ItemTypeUpdatedEvent = {
  type: 'item-type.updated';
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  updatedAt: Date;
};

export type ItemTypeEvent = ItemTypeCreatedEvent | ItemTypeUpdatedEvent;

import type { TypeId } from '@/kernel/domain/ids.js';

export type WidgetType =
  | 'base-info'
  | 'age-group'
  | 'location'
  | 'payment'
  | 'category'
  | 'owner'
  | 'item-review'
  | 'owner-review'
  | 'event-date-time'
  | 'schedule';

export type ProductTypeReadModel = {
  typeId: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  createdAt: Date;
  updatedAt: Date;
};

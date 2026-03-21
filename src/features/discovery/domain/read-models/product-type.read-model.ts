import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

export type ProductTypeReadModel = {
  typeId: TypeId;
  name: string;
  widgetSettings: WidgetSettings[];
  createdAt: Date;
  updatedAt: Date;
};

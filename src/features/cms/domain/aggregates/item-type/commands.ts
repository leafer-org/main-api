import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

export type CreateItemTypeCommand = {
  type: 'CreateItemType';
  id: TypeId;
  name: string;
  label: string;
  widgetSettings: WidgetSettings[];
  now: Date;
};

export type UpdateItemTypeCommand = {
  type: 'UpdateItemType';
  name: string;
  label: string;
  widgetSettings: WidgetSettings[];
  now: Date;
};

export type ItemTypeCommand = CreateItemTypeCommand | UpdateItemTypeCommand;

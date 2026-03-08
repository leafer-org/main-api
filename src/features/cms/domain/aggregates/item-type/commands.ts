import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

export type CreateItemTypeCommand = {
  type: 'CreateItemType';
  id: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  now: Date;
};

export type UpdateItemTypeCommand = {
  type: 'UpdateItemType';
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  now: Date;
};

export type ItemTypeCommand = CreateItemTypeCommand | UpdateItemTypeCommand;

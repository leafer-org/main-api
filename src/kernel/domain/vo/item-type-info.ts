import type { TypeId } from '../ids.js';
import type { WidgetType } from './widget.js';

export type ItemTypeInfo = {
  id: TypeId;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
};

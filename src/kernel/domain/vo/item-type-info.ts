import type { TypeId } from '../ids.js';
import type { WidgetSettings } from './widget-settings.js';

export type ItemTypeInfo = {
  id: TypeId;
  widgetSettings: WidgetSettings[];
};

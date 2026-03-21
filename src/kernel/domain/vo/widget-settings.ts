import type { PaymentStrategy } from './widget.js';

// --- Per-widget settings ---

type BaseInfoWidgetSettings = { type: 'base-info'; required: boolean };
type AgeGroupWidgetSettings = { type: 'age-group'; required: boolean };
type LocationWidgetSettings = { type: 'location'; required: boolean };
type PaymentWidgetSettings = {
  type: 'payment';
  required: boolean;
  allowedStrategies: PaymentStrategy[];
};
type CategoryWidgetSettings = { type: 'category'; required: boolean };
type OwnerWidgetSettings = { type: 'owner'; required: boolean };
type ItemReviewWidgetSettings = { type: 'item-review'; required: boolean };
type OwnerReviewWidgetSettings = { type: 'owner-review'; required: boolean };
type EventDateTimeWidgetSettings = {
  type: 'event-date-time';
  required: boolean;
  maxDates: number | null;
};
type ScheduleWidgetSettings = { type: 'schedule'; required: boolean };

export type WidgetSettings =
  | BaseInfoWidgetSettings
  | AgeGroupWidgetSettings
  | LocationWidgetSettings
  | PaymentWidgetSettings
  | CategoryWidgetSettings
  | OwnerWidgetSettings
  | ItemReviewWidgetSettings
  | OwnerReviewWidgetSettings
  | EventDateTimeWidgetSettings
  | ScheduleWidgetSettings;

export type WidgetSettingsType = WidgetSettings['type'];

// --- Helpers ---

export function getRequiredWidgetTypes(settings: WidgetSettings[]): WidgetSettingsType[] {
  return settings.filter((s) => s.required).map((s) => s.type);
}

export function getAvailableWidgetTypes(settings: WidgetSettings[]): WidgetSettingsType[] {
  return settings.map((s) => s.type);
}

export function findWidgetSettings<T extends WidgetSettings['type']>(
  settings: WidgetSettings[],
  type: T,
): Extract<WidgetSettings, { type: T }> | null {
  const found = settings.find((s) => s.type === type);
  return (found as Extract<WidgetSettings, { type: T }>) ?? null;
}

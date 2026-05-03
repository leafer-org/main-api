import type { PaymentStrategy } from './widget.js';

// --- Per-widget settings ---

type BaseInfoWidgetSettings = { type: 'base-info'; required: boolean; showOnCard?: boolean };
type AgeGroupWidgetSettings = { type: 'age-group'; required: boolean; showOnCard?: boolean };
type LocationWidgetSettings = { type: 'location'; required: boolean; showOnCard?: boolean };
type PaymentWidgetSettings = {
  type: 'payment';
  required: boolean;
  allowedStrategies: PaymentStrategy[];
  showOnCard?: boolean;
};
type CategoryWidgetSettings = { type: 'category'; required: boolean; showOnCard?: boolean };
type OwnerWidgetSettings = { type: 'owner'; required: boolean; showOnCard?: boolean };
type ItemReviewWidgetSettings = { type: 'item-review'; required: boolean; showOnCard?: boolean };
type OwnerReviewWidgetSettings = { type: 'owner-review'; required: boolean; showOnCard?: boolean };
type EventDateTimeWidgetSettings = {
  type: 'event-date-time';
  required: boolean;
  maxDates: number | null;
  showOnCard?: boolean;
};
type ScheduleWidgetSettings = { type: 'schedule'; required: boolean; showOnCard?: boolean };
type ContactInfoWidgetSettings = { type: 'contact-info'; required: boolean; showOnCard?: boolean };
type TeamWidgetSettings = { type: 'team'; required: boolean; showOnCard?: boolean };

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
  | ScheduleWidgetSettings
  | ContactInfoWidgetSettings
  | TeamWidgetSettings;

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

/**
 * Виджеты, чьё содержимое всегда показывается на карточке списка (когда виджет включён в типе).
 * Их `showOnCard` не редактируется — UI запрещает менять, бэкенд валидирует на false.
 * Ровно эти виджеты дают «базовые» поля карточки (title/media/owner/price/rating/location.address).
 */
export const ALWAYS_ON_CARD_WIDGET_TYPES: ReadonlySet<WidgetSettingsType> = new Set([
  'base-info',
  'owner',
  'payment',
  'item-review',
  'location',
]);

/** Виджеты, для которых допустим showOnCard (фактически или по принуждению). */
export const CARD_ELIGIBLE_WIDGET_TYPES: ReadonlySet<WidgetSettingsType> = new Set([
  ...ALWAYS_ON_CARD_WIDGET_TYPES,
  'event-date-time',
  'schedule',
  'age-group',
]);

export function isCardEligibleWidgetType(type: WidgetSettingsType): boolean {
  return CARD_ELIGIBLE_WIDGET_TYPES.has(type);
}

export function isAlwaysOnCardWidgetType(type: WidgetSettingsType): boolean {
  return ALWAYS_ON_CARD_WIDGET_TYPES.has(type);
}

/**
 * Виджет показывается на карточке если:
 *  - его тип в ALWAYS_ON_CARD (showOnCard=true forced, независимо от хранимого значения), или
 *  - тип card-eligible и явно showOnCard=true.
 */
export function isShownOnCard(settings: WidgetSettings): boolean {
  if (isAlwaysOnCardWidgetType(settings.type)) return true;
  return settings.showOnCard === true && isCardEligibleWidgetType(settings.type);
}

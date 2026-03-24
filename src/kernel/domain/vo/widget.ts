import type { AttributeId, CategoryId, MediaId, OrganizationId } from '../ids.js';
import type { AgeGroupOption } from './age-group.js';
import type { MediaItem } from './media-item.js';

// --- Related VOs ---

export type PaymentStrategy = 'free' | 'one-time' | 'subscription';

export type ScheduleEntry = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

// --- Widget types ---

export type BaseInfoWidget = {
  type: 'base-info';
  title: string;
  description: string;
  media: MediaItem[];
};
export type AgeGroupWidget = { type: 'age-group'; value: AgeGroupOption };
export type LocationWidget = {
  type: 'location';
  cityId: string;
  lat: number;
  lng: number;
  address: string | null;
};
export type PaymentOption = {
  name: string;
  description: string | null;
  strategy: PaymentStrategy;
  price: number | null;
};

export type PaymentWidget = { type: 'payment'; options: PaymentOption[] };
export type CategoryWidget = {
  type: 'category';
  categoryIds: CategoryId[];
  attributes: { attributeId: AttributeId; value: string }[];
};
export type OwnerWidget = {
  type: 'owner';
  organizationId: OrganizationId;
  name: string;
  avatarId: MediaId | null;
};
export type ItemReviewWidget = { type: 'item-review'; rating: number | null; reviewCount: number };
export type OwnerReviewWidget = {
  type: 'owner-review';
  rating: number | null;
  reviewCount: number;
};
export type EventDateTimeWidget = { type: 'event-date-time'; dates: string[] };

export const EventDateTimeWidget = {
  findNextDate(dates: Date[], now: Date): Date | null {
    const future = dates.filter((d) => d.getTime() > now.getTime());
    if (future.length === 0) return null;
    future.sort((a, b) => a.getTime() - b.getTime());
    return future[0] ?? null;
  },
};
export type ScheduleWidget = { type: 'schedule'; entries: ScheduleEntry[] };

export type ContactLinkType = 'phone' | 'email' | 'link';
export type ContactLink = { type: ContactLinkType; value: string; label?: string };
export type ContactInfoWidget = { type: 'contact-info'; contacts: ContactLink[] };

export type ItemWidget =
  | BaseInfoWidget
  | AgeGroupWidget
  | LocationWidget
  | PaymentWidget
  | CategoryWidget
  | OwnerWidget
  | ItemReviewWidget
  | OwnerReviewWidget
  | EventDateTimeWidget
  | ScheduleWidget
  | ContactInfoWidget;

export type WidgetType = ItemWidget['type'];

export const ALL_WIDGET_TYPES: WidgetType[] = [
  'base-info',
  'age-group',
  'location',
  'payment',
  'category',
  'owner',
  'item-review',
  'owner-review',
  'event-date-time',
  'schedule',
  'contact-info',
];

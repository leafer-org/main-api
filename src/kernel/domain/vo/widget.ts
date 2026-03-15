import type { AttributeId, CategoryId, FileId, OrganizationId } from '../ids.js';
import type { AgeGroupOption } from './age-group.js';

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
  imageId: FileId | null;
};
export type AgeGroupWidget = { type: 'age-group'; value: AgeGroupOption };
export type LocationWidget = {
  type: 'location';
  cityId: string;
  lat: number;
  lng: number;
  address: string | null;
};
export type PaymentWidget = { type: 'payment'; strategy: PaymentStrategy; price: number | null };
export type CategoryWidget = {
  type: 'category';
  categoryIds: CategoryId[];
  attributes: { attributeId: AttributeId; value: string }[];
};
export type OwnerWidget = {
  type: 'owner';
  organizationId: OrganizationId;
  name: string;
  avatarId: FileId | null;
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
  | ScheduleWidget;

export type WidgetType = ItemWidget['type'];

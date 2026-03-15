import type { CategoryId, FileId, ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { PaymentStrategy, ScheduleEntry } from '@/kernel/domain/vo/widget.js';

export type ItemWidgetView =
  | { type: 'base-info'; title: string; description: string; imageId: FileId | null }
  | { type: 'age-group'; value: AgeGroupOption }
  | { type: 'location'; cityId: string; lat: number; lng: number; address: string | null }
  | { type: 'payment'; strategy: PaymentStrategy; price: number | null }
  | { type: 'category'; categoryIds: CategoryId[] }
  | { type: 'owner'; organizationId: OrganizationId; name: string; avatarId: FileId | null }
  | { type: 'item-review'; rating: number | null; reviewCount: number }
  | { type: 'owner-review'; rating: number | null; reviewCount: number }
  | { type: 'event-date-time'; dates: string[] }
  | { type: 'schedule'; entries: ScheduleEntry[] };

export type ItemDetailView = {
  itemId: ItemId;
  typeId: TypeId;
  widgets: ItemWidgetView[];
  publishedAt: Date;
};

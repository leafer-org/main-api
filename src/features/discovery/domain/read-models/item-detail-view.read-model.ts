import type { CategoryId, MediaId, ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import type { ContactLink, PaymentStrategy, ScheduleEntry, TeamMember } from '@/kernel/domain/vo/widget.js';

export type ItemWidgetView =
  | { type: 'base-info'; title: string; description: string; media: MediaItem[] }
  | { type: 'age-group'; value: AgeGroupOption }
  | { type: 'location'; cityId: string; lat: number; lng: number; address: string | null }
  | { type: 'payment'; options: { name: string; description: string | null; strategy: PaymentStrategy; price: number | null }[] }
  | { type: 'category'; categoryIds: CategoryId[] }
  | { type: 'owner'; organizationId: OrganizationId; name: string; avatarId: MediaId | null }
  | { type: 'item-review'; rating: number | null; reviewCount: number }
  | { type: 'owner-review'; rating: number | null; reviewCount: number }
  | { type: 'event-date-time'; dates: { date: string; label?: string }[] }
  | { type: 'schedule'; entries: ScheduleEntry[] }
  | { type: 'contact-info'; contacts: ContactLink[] }
  | { type: 'team'; title: string; members: TeamMember[] };

export type ItemDetailView = {
  itemId: ItemId;
  typeId: TypeId;
  widgets: ItemWidgetView[];
  hasVideo: boolean;
  publishedAt: Date;
};

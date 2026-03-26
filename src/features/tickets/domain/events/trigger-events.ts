import type { ItemWidget } from '@/kernel/domain/vo/widget.js';
import type { CategoryId, ItemId, MediaId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

export type ItemModerationRequestedTriggerEvent = {
  type: 'item.moderation-requested';
  id: string;
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  submittedAt: Date;
};

export type OrganizationModerationRequestedTriggerEvent = {
  type: 'organization.moderation-requested';
  id: string;
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  submittedAt: Date;
};

export type TriggerEvent =
  | ItemModerationRequestedTriggerEvent
  | OrganizationModerationRequestedTriggerEvent;

import type { ItemId, OrganizationId, TypeId } from '../ids.js';
import type { ItemWidget } from '../vo/widget.js';

export type { ItemWidget } from '../vo/widget.js';

export type ItemPublishedEvent = {
  id: string;
  type: 'item.published';
  itemId: ItemId;
  typeId: TypeId;
  organizationId: OrganizationId;
  widgets: ItemWidget[];
  republished: boolean;
  publishedAt: Date;
};

export type ItemUnpublishedEvent = {
  id: string;
  type: 'item.unpublished';
  itemId: ItemId;
  unpublishedAt: Date;
};

export type ItemModerationRequestedEvent = {
  id: string;
  type: 'item.moderation-requested';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  submittedAt: Date;
};

export type ItemIntegrationEvent =
  | ItemPublishedEvent
  | ItemUnpublishedEvent
  | ItemModerationRequestedEvent;

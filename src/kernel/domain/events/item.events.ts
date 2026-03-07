import type { ItemId, TypeId, OrganizationId } from '../ids.js';
import type { ItemWidget } from '../vo/widget.js';

export type { ItemWidget } from '../vo/widget.js';

export type ItemPublishedEvent = {
  type: 'item.published';
  itemId: ItemId;
  typeId: TypeId;
  organizationId: OrganizationId;
  widgets: ItemWidget[];
  republished: boolean;
  publishedAt: Date;
};

export type ItemUnpublishedEvent = {
  type: 'item.unpublished';
  itemId: ItemId;
  unpublishedAt: Date;
};

export type ItemIntegrationEvent = ItemPublishedEvent | ItemUnpublishedEvent;

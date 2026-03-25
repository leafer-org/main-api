import type { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemWidget, WidgetType } from '@/kernel/domain/vo/widget.js';

// --- Lifecycle ---

export type ItemCreatedEvent = {
  type: 'item.created';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  createdAt: Date;
};

export type ItemDraftUpdatedEvent = {
  type: 'item.draft-updated';
  itemId: ItemId;
  typeId?: TypeId;
  widgets: ItemWidget[];
  updatedAt: Date;
};

export type ItemDraftDeletedEvent = {
  type: 'item.draft-deleted';
  itemId: ItemId;
  deletedAt: Date;
};

// --- Moderation ---

export type ItemSubmittedForModerationEvent = {
  type: 'item.submitted-for-moderation';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  submittedAt: Date;
};

export type ItemModerationApprovedEvent = {
  type: 'item.moderation-approved';
  eventId: string;
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  republished: boolean;
  publishedAt: Date;
};

export type ItemModerationRejectedEvent = {
  type: 'item.moderation-rejected';
  itemId: ItemId;
  rejectedAt: Date;
};

// --- Publication ---

export type ItemUnpublishedInternalEvent = {
  type: 'item.unpublished-internal';
  eventId: string;
  itemId: ItemId;
  widgets: ItemWidget[];
  unpublishedAt: Date;
};

// --- Union ---

export type ItemEvent =
  | ItemCreatedEvent
  | ItemDraftUpdatedEvent
  | ItemDraftDeletedEvent
  | ItemSubmittedForModerationEvent
  | ItemModerationApprovedEvent
  | ItemModerationRejectedEvent
  | ItemUnpublishedInternalEvent;

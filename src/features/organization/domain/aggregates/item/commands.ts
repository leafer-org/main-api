import type { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemWidget, WidgetType } from '@/kernel/domain/vo/widget.js';

// --- Lifecycle ---

export type CreateItemCommand = {
  type: 'CreateItem';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  allowedWidgetTypes: WidgetType[];
  now: Date;
};

export type UpdateDraftCommand = {
  type: 'UpdateDraft';
  widgets: ItemWidget[];
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  allowedWidgetTypes: WidgetType[];
  now: Date;
};

export type DeleteDraftCommand = {
  type: 'DeleteDraft';
  now: Date;
};

// --- Moderation ---

export type SubmitItemForModerationCommand = {
  type: 'SubmitItemForModeration';
  now: Date;
};

export type ApproveItemModerationCommand = {
  type: 'ApproveItemModeration';
  eventId: string;
  now: Date;
};

export type RejectItemModerationCommand = {
  type: 'RejectItemModeration';
  now: Date;
};

// --- Publication ---

export type UnpublishItemCommand = {
  type: 'UnpublishItem';
  eventId: string;
  now: Date;
};

// --- Union ---

export type ItemCommand =
  | CreateItemCommand
  | UpdateDraftCommand
  | DeleteDraftCommand
  | SubmitItemForModerationCommand
  | ApproveItemModerationCommand
  | RejectItemModerationCommand
  | UnpublishItemCommand;

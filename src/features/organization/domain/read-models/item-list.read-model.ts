import type { DraftStatus } from '../aggregates/item/entity.js';
import type { ItemId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';

export type ItemListItem = {
  itemId: ItemId;
  typeId: TypeId;
  draftStatus: DraftStatus | null;
  hasPublication: boolean;
  /** Widgets from draft (preferred) or publication — for card preview */
  widgets: ItemWidget[];
  createdAt: Date;
  updatedAt: Date;
};

export type ItemListQuery = {
  organizationId: string;
  search?: string;
  cursor?: string;
  limit: number;
};

export type ItemListReadModel = {
  items: ItemListItem[];
  nextCursor: string | null;
};

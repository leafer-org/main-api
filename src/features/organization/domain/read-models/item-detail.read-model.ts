import type { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';
import type { DraftStatus } from '../aggregates/item/entity.js';

export type ItemDetailReadModel = {
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  draft: {
    widgets: ItemWidget[];
    status: DraftStatus;
    updatedAt: Date;
  } | null;
  publication: {
    widgets: ItemWidget[];
    publishedAt: Date;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

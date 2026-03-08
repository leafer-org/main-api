import type { ItemId, TypeId } from '@/kernel/domain/ids.js';
import type { DraftStatus } from '../aggregates/item/entity.js';

export type ItemListReadModel = {
  items: {
    itemId: ItemId;
    typeId: TypeId;
    draftStatus: DraftStatus | null;
    hasPublication: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[];
};

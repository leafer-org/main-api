import type { CategoryId, FileId } from '@/kernel/domain/ids.js';

export type CategoryListReadModel = {
  categoryId: CategoryId;
  name: string;
  iconId: FileId | null;
  childCount: number;
  itemCount: number;
};

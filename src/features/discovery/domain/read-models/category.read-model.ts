import type { CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';

export type CategoryReadModel = {
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];
  createdAt: Date;
  updatedAt: Date;
};

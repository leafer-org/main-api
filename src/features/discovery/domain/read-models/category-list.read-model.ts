import type { CategoryId, FileId } from '@/kernel/domain/ids.js';

/** Список дочерних категорий для каталога. Запрос по parentCategoryId (null = корневые). */
export type CategoryListReadModel = {
  categoryId: CategoryId;
  name: string;
  iconId: FileId | null;
  childCount: number;
  itemCount: number;
};

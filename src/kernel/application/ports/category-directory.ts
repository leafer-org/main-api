import type { CategoryId, MediaId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/age-group.js';
import type { CategoryAttribute } from '@/kernel/domain/vo/category-attribute.js';

export type CategoryDirectoryStatus = 'draft' | 'published' | 'unpublished';

export type CategoryDirectoryView = {
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: MediaId;
  order: number;
  status: CategoryDirectoryStatus;
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];
  ageGroups: AgeGroup[];
  attributes: CategoryAttribute[];
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class CategoryDirectoryPort {
  public abstract findById(id: CategoryId): Promise<CategoryDirectoryView | null>;
  public abstract findByIds(ids: readonly CategoryId[]): Promise<CategoryDirectoryView[]>;
  /** Все опубликованные категории, отсортированные по order ASC, name ASC. */
  public abstract findAllPublished(): Promise<CategoryDirectoryView[]>;
  /**
   * Опубликованные дети заданного родителя (parentId = null → корневые).
   * Сортировка по order ASC, name ASC.
   */
  public abstract findPublishedByParentId(
    parentId: CategoryId | null,
  ): Promise<CategoryDirectoryView[]>;
  /**
   * Все потомки (включая саму) — published. Используется для junction-cascade
   * и для денормализации ancestor-цепи в `discovery_item_categories`.
   */
  public abstract findDescendantIds(rootId: CategoryId): Promise<CategoryId[]>;
  /**
   * Замыкание по предкам: union(directIds ∪ all ancestors).
   * Возвращает плоский set уникальных id (порядок не важен).
   * Используется проектором товаров для денормализации в junction/Meili/Gorse.
   */
  public abstract findAncestorClosure(
    directIds: readonly CategoryId[],
  ): Promise<CategoryId[]>;
  /**
   * Сбрасывает in-memory cache адаптера. Вызывается consumer'ами тонкого
   * события `category.changed`, чтобы следующий read увидел свежий state.
   */
  public abstract clearCache(): void;
}

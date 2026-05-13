import type { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';

/**
 * Снимок published-state товара. Источник — `organization.items` (write-side).
 * Если товар не опубликован/удалён — `findById` вернёт `null`.
 */
export type ItemDirectoryView = {
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  publishedAt: Date;
  updatedAt: Date;
};

export abstract class ItemDirectoryPort {
  public abstract findById(id: ItemId): Promise<ItemDirectoryView | null>;
  public abstract findByIds(ids: readonly ItemId[]): Promise<ItemDirectoryView[]>;
  /** Сбрасывает in-memory cache адаптера. Зовётся consumer'ами `item.changed`. */
  public abstract clearCache(): void;
}

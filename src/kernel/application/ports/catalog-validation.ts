import type { TypeId } from '@/kernel/domain/ids.js';
import type { ItemTypeInfo } from '@/kernel/domain/vo/item-type-info.js';

export abstract class CatalogValidationPort {
  public abstract getItemType(typeId: TypeId): Promise<ItemTypeInfo | null>;
}

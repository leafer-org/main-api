import type { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

export type ItemTypeDirectoryView = {
  typeId: TypeId;
  name: string;
  label: string;
  widgetSettings: WidgetSettings[];
  createdAt: Date;
  updatedAt: Date;
};

export abstract class ItemTypeDirectoryPort {
  public abstract findById(id: TypeId): Promise<ItemTypeDirectoryView | null>;
  public abstract findByIds(ids: readonly TypeId[]): Promise<ItemTypeDirectoryView[]>;
}

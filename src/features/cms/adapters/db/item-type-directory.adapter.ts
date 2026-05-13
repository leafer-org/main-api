import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { cmsItemTypes } from './schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import {
  type ItemTypeDirectoryView,
  ItemTypeDirectoryPort,
} from '@/kernel/application/ports/item-type-directory.js';
import { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

@Injectable()
export class DrizzleItemTypeDirectoryAdapter implements ItemTypeDirectoryPort {
  public constructor(private readonly connectionPool: ConnectionPool) {}

  public async findById(id: TypeId): Promise<ItemTypeDirectoryView | null> {
    const rows = await this.connectionPool.db
      .select()
      .from(cmsItemTypes)
      .where(eq(cmsItemTypes.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.toView(row);
  }

  public async findByIds(ids: readonly TypeId[]): Promise<ItemTypeDirectoryView[]> {
    if (ids.length === 0) return [];

    const rows = await this.connectionPool.db
      .select()
      .from(cmsItemTypes)
      .where(inArray(cmsItemTypes.id, ids as TypeId[]));

    return rows.map((row) => this.toView(row));
  }

  private toView(row: typeof cmsItemTypes.$inferSelect): ItemTypeDirectoryView {
    return {
      typeId: TypeId.raw(row.id),
      name: row.name,
      label: row.label,
      widgetSettings: row.widgetSettings as WidgetSettings[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

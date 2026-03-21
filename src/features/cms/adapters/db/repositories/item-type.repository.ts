import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ItemTypeRepository } from '../../../application/ports.js';
import type { ItemTypeEntity } from '../../../domain/aggregates/item-type/entity.js';
import { cmsItemTypes } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

@Injectable()
export class DrizzleItemTypeRepository implements ItemTypeRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, id: TypeId): Promise<ItemTypeEntity | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(cmsItemTypes).where(eq(cmsItemTypes.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      id: TypeId.raw(row.id),
      name: row.name,
      label: row.label,
      widgetSettings: row.widgetSettings as WidgetSettings[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public async save(tx: Transaction, state: ItemTypeEntity): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(cmsItemTypes)
      .values({
        id: state.id as string,
        name: state.name,
        label: state.label,
        widgetSettings: state.widgetSettings,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: cmsItemTypes.id,
        set: {
          name: state.name,
          label: state.label,
          widgetSettings: state.widgetSettings,
          updatedAt: state.updatedAt,
        },
      });
  }
}

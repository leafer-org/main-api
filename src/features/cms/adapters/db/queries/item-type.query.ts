import { Injectable } from '@nestjs/common';

import { type ItemTypeListItem, ItemTypeQueryPort } from '../../../application/ports.js';
import { cmsItemTypes } from '../schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import { TypeId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleItemTypeQuery implements ItemTypeQueryPort {
  public constructor(private readonly connectionPool: ConnectionPool) {}

  public async findAll(): Promise<ItemTypeListItem[]> {
    const rows = await this.connectionPool.db
      .select()
      .from(cmsItemTypes)
      .orderBy(cmsItemTypes.name);

    return rows.map((row) => ({
      id: TypeId.raw(row.id),
      name: row.name,
      availableWidgetTypes: row.availableWidgetTypes as ItemTypeListItem['availableWidgetTypes'],
      requiredWidgetTypes: row.requiredWidgetTypes as ItemTypeListItem['requiredWidgetTypes'],
    }));
  }
}

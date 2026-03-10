import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { cmsItemTypes } from './schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import { CatalogValidationPort } from '@/kernel/application/ports/catalog-validation.js';
import { TypeId } from '@/kernel/domain/ids.js';
import type { ItemTypeInfo } from '@/kernel/domain/vo/item-type-info.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

@Injectable()
export class DrizzleCatalogValidationAdapter implements CatalogValidationPort {
  public constructor(private readonly connectionPool: ConnectionPool) {}

  public async getItemType(typeId: TypeId): Promise<ItemTypeInfo | null> {
    const rows = await this.connectionPool.db
      .select()
      .from(cmsItemTypes)
      .where(eq(cmsItemTypes.id, typeId as string))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: TypeId.raw(row.id),
      availableWidgetTypes: row.availableWidgetTypes as WidgetType[],
      requiredWidgetTypes: row.requiredWidgetTypes as WidgetType[],
    };
  }
}

import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import {
  CategoryFiltersQueryPort,
  type CategoryWithAttributes,
} from '../../../application/ports.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryCategories, discoveryItemTypes } from '../schema.js';
import { AttributeId, CategoryId, TypeId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

@Injectable()
export class DrizzleCategoryFiltersQuery implements CategoryFiltersQueryPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findById(
    categoryId: CategoryId,
  ): Promise<CategoryWithAttributes | null> {
    const categoryRows = await this.dbClient.db
      .select()
      .from(discoveryCategories)
      .where(eq(discoveryCategories.id, categoryId as string))
      .limit(1);

    const row = categoryRows[0];
    if (!row) return null;

    return this.toCategoryWithAttributes(row);
  }

  public async findTypesByIds(typeIds: TypeId[]): Promise<{ typeId: TypeId; name: string }[]> {
    if (typeIds.length === 0) return [];

    const rows = await this.dbClient.db
      .select({ id: discoveryItemTypes.id, name: discoveryItemTypes.name })
      .from(discoveryItemTypes)
      .where(inArray(discoveryItemTypes.id, typeIds as string[]));

    return rows.map((r) => ({ typeId: TypeId.raw(r.id), name: r.name }));
  }

  private toCategoryWithAttributes(
    row: typeof discoveryCategories.$inferSelect,
  ): CategoryWithAttributes {
    return {
      categoryId: CategoryId.raw(row.id),
      allowedTypeIds: row.allowedTypeIds.map((id) => TypeId.raw(id)),
      attributes: row.attributes.map((a) => ({
        attributeId: AttributeId.raw(a.attributeId),
        name: a.name,
        required: a.required,
        schema: a.schema as AttributeSchema,
      })),
    };
  }
}

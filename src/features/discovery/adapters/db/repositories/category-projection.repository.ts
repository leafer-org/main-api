import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { CategoryProjectionPort } from '../../../application/projection-ports.js';
import type { CategoryReadModel } from '../../../domain/read-models/category.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryCategories } from '../schema.js';
import type { CategoryId } from '@/kernel/domain/ids.js';

type CategoryRow = {
  id: string;
  parentCategoryId: string | null;
  itemCount: number;
};

@Injectable()
export class DrizzleCategoryProjectionRepository implements CategoryProjectionPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async upsert(category: CategoryReadModel): Promise<void> {
    await this.dbClient.db
      .insert(discoveryCategories)
      .values({
        id: category.categoryId as string,
        parentCategoryId: category.parentCategoryId as string | null,
        name: category.name,
        iconId: category.iconId as string | null,
        allowedTypeIds: category.allowedTypeIds as string[],
        ancestorIds: category.ancestorIds as string[],
        attributes: category.attributes.map((a) => ({
          attributeId: a.attributeId as string,
          name: a.name,
          required: a.required,
          schema: a.schema,
        })),
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      })
      .onConflictDoUpdate({
        target: discoveryCategories.id,
        set: {
          parentCategoryId: category.parentCategoryId as string | null,
          name: category.name,
          iconId: category.iconId as string | null,
          allowedTypeIds: category.allowedTypeIds as string[],
          ancestorIds: category.ancestorIds as string[],
          attributes: category.attributes.map((a) => ({
            attributeId: a.attributeId as string,
            name: a.name,
            required: a.required,
            schema: a.schema,
          })),
          updatedAt: category.updatedAt,
        },
      });
  }

  public async delete(categoryId: CategoryId): Promise<void> {
    await this.dbClient.db
      .delete(discoveryCategories)
      .where(eq(discoveryCategories.id, categoryId as string));
  }

  public async recalcAllCounts(): Promise<void> {
    // Step 1: Update childCount and direct itemCount for all categories
    await this.dbClient.db.execute(sql`
      UPDATE discovery_categories dc SET
        child_count = (SELECT count(*)::int FROM discovery_categories c2 WHERE c2.parent_category_id = dc.id::text),
        item_count = (SELECT count(*)::int FROM discovery_item_categories dic WHERE dic.category_id = dc.id::text)
    `);

    // Step 2: Accumulate itemCount from children to parents (bottom-up)
    const rows = await this.dbClient.db
      .select({
        id: discoveryCategories.id,
        parentCategoryId: discoveryCategories.parentCategoryId,
        itemCount: discoveryCategories.itemCount,
      })
      .from(discoveryCategories);

    const byId = new Map<string, CategoryRow>(rows.map((r) => [r.id, r]));

    // Build accumulated counts bottom-up: add each node's itemCount to all ancestors
    const accumulated = new Map<string, number>();
    for (const row of rows) {
      accumulated.set(row.id, row.itemCount);
    }

    for (const row of rows) {
      let parentId = row.parentCategoryId;
      while (parentId !== null) {
        accumulated.set(parentId, (accumulated.get(parentId) ?? 0) + row.itemCount);
        const parent = byId.get(parentId);
        parentId = parent?.parentCategoryId ?? null;
      }
    }

    // Step 3: Update categories whose accumulated itemCount differs from direct
    const updates: Promise<unknown>[] = [];
    for (const [id, total] of accumulated) {
      const row = byId.get(id);
      if (row && total !== row.itemCount) {
        updates.push(
          this.dbClient.db
            .update(discoveryCategories)
            .set({ itemCount: total })
            .where(eq(discoveryCategories.id, id)),
        );
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  }
}

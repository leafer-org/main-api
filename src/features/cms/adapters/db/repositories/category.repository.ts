import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { CategoryRepository } from '../../../application/ports.js';
import type { CategoryEntity, CategoryStatus } from '../../../domain/aggregates/category/entity.js';
import { cmsCategories } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { CategoryId, type FileId, type TypeId } from '@/kernel/domain/ids.js';
import type { CategoryAttribute } from '@/kernel/domain/vo/category-attribute.js';

@Injectable()
export class DrizzleCategoryRepository implements CategoryRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, id: CategoryId): Promise<CategoryEntity | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(cmsCategories).where(eq(cmsCategories.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);
  }

  public async findAncestors(tx: Transaction, id: CategoryId): Promise<CategoryEntity[]> {
    const db = this.txHost.get(tx);
    const result = await db.execute(sql`
      WITH RECURSIVE ancestors AS (
        SELECT c.* FROM cms_categories c
        WHERE c.id = (SELECT parent_category_id FROM cms_categories WHERE id = ${id})
        UNION ALL
        SELECT c.* FROM cms_categories c
        INNER JOIN ancestors a ON c.id = a.parent_category_id
      )
      SELECT * FROM ancestors
    `);
    return (result.rows as any[]).map((row) => this.toDomainFromRaw(row));
  }

  public async findDescendants(tx: Transaction, id: CategoryId): Promise<CategoryEntity[]> {
    const db = this.txHost.get(tx);
    const result = await db.execute(sql`
      WITH RECURSIVE descendants AS (
        SELECT c.* FROM cms_categories c
        WHERE c.parent_category_id = ${id}
        UNION ALL
        SELECT c.* FROM cms_categories c
        INNER JOIN descendants d ON c.parent_category_id = d.id
      )
      SELECT * FROM descendants
    `);
    return (result.rows as any[]).map((row) => this.toDomainFromRaw(row));
  }

  public async save(tx: Transaction, state: CategoryEntity): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(cmsCategories)
      .values({
        id: state.id as string,
        parentCategoryId: state.parentCategoryId as string | null,
        name: state.name,
        iconId: state.iconId as string | null,
        allowedTypeIds: state.allowedTypeIds as string[],
        attributes: state.attributes as any,
        status: state.status,
        publishedAt: state.publishedAt,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: cmsCategories.id,
        set: {
          parentCategoryId: state.parentCategoryId as string | null,
          name: state.name,
          iconId: state.iconId as string | null,
          allowedTypeIds: state.allowedTypeIds as string[],
          attributes: state.attributes as any,
          status: state.status,
          publishedAt: state.publishedAt,
          updatedAt: state.updatedAt,
        },
      });
  }

  private toDomain(row: typeof cmsCategories.$inferSelect): CategoryEntity {
    return {
      id: CategoryId.raw(row.id),
      parentCategoryId: row.parentCategoryId ? CategoryId.raw(row.parentCategoryId) : null,
      name: row.name,
      iconId: row.iconId ? (row.iconId as FileId) : null,
      allowedTypeIds: (row.allowedTypeIds as string[]).map((id) => id as TypeId),
      attributes: row.attributes as CategoryAttribute[],
      status: row.status as CategoryStatus,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toDomainFromRaw(row: any): CategoryEntity {
    return {
      id: CategoryId.raw(row.id),
      parentCategoryId: row.parent_category_id ? CategoryId.raw(row.parent_category_id) : null,
      name: row.name,
      iconId: row.icon_id ? (row.icon_id as FileId) : null,
      allowedTypeIds: (
        (typeof row.allowed_type_ids === 'string'
          ? JSON.parse(row.allowed_type_ids)
          : row.allowed_type_ids) as string[]
      ).map((id) => id as TypeId),
      attributes:
        typeof row.attributes === 'string'
          ? JSON.parse(row.attributes)
          : (row.attributes as CategoryAttribute[]),
      status: row.status as CategoryStatus,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

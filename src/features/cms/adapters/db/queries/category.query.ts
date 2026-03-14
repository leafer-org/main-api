import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { type CategoryListItem, CategoryQueryPort } from '../../../application/ports.js';
import type { CategoryEntity, CategoryStatus } from '../../../domain/aggregates/category/entity.js';
import { cmsCategories } from '../schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import { CategoryId, type FileId, type TypeId } from '@/kernel/domain/ids.js';
import type { CategoryAttribute } from '@/kernel/domain/vo/category-attribute.js';

@Injectable()
export class DrizzleCategoryQuery implements CategoryQueryPort {
  public constructor(private readonly connectionPool: ConnectionPool) {}

  public async findAll(): Promise<CategoryListItem[]> {
    const rows = await this.connectionPool.db
      .select({
        id: cmsCategories.id,
        parentCategoryId: cmsCategories.parentCategoryId,
        name: cmsCategories.name,
        status: cmsCategories.status,
        attributes: cmsCategories.attributes,
      })
      .from(cmsCategories)
      .orderBy(cmsCategories.name);

    return rows.map((row) => ({
      id: CategoryId.raw(row.id),
      parentCategoryId: row.parentCategoryId ? CategoryId.raw(row.parentCategoryId) : null,
      name: row.name,
      status: row.status as CategoryEntity['status'],
      attributes: row.attributes as CategoryAttribute[],
    }));
  }

  public async findDetail(id: CategoryId): Promise<CategoryEntity | null> {
    const rows = await this.connectionPool.db
      .select()
      .from(cmsCategories)
      .where(eq(cmsCategories.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

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
}

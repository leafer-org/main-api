import { Injectable } from '@nestjs/common';
import { asc, eq, isNull } from 'drizzle-orm';

import { CategoryListQueryPort } from '../../../application/ports.js';
import type { CategoryListReadModel } from '../../../domain/read-models/category-list.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryCategories } from '../schema.js';
import { CategoryId, MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleCategoryListQuery implements CategoryListQueryPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findByParentId(
    parentCategoryId: CategoryId | null,
  ): Promise<CategoryListReadModel[]> {
    const condition =
      parentCategoryId !== null
        ? eq(discoveryCategories.parentCategoryId, parentCategoryId as string)
        : isNull(discoveryCategories.parentCategoryId);

    const categories = await this.dbClient.db
      .select({
        categoryId: discoveryCategories.id,
        name: discoveryCategories.name,
        iconId: discoveryCategories.iconId,
        childCount: discoveryCategories.childCount,
        itemCount: discoveryCategories.itemCount,
      })
      .from(discoveryCategories)
      .where(condition)
      .orderBy(asc(discoveryCategories.order), asc(discoveryCategories.name));

    return categories.map((cat) => ({
      categoryId: CategoryId.raw(cat.categoryId),
      name: cat.name,
      iconId: MediaId.raw(cat.iconId),
      childCount: cat.childCount,
      itemCount: cat.itemCount,
    }));
  }
}

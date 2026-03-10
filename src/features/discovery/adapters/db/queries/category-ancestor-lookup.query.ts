import { Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import { CategoryAncestorLookupPort } from '../../../application/ports.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryCategories } from '../schema.js';
import { CategoryId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleCategoryAncestorLookupQuery implements CategoryAncestorLookupPort {
  private readonly cache = new Map<string, CategoryId[]>();
  private readonly rootCache = new Map<string, CategoryId>();

  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findAncestorIds(categoryIds: CategoryId[]): Promise<CategoryId[]> {
    if (categoryIds.length === 0) return [];

    const allAncestors = new Set<string>();
    const uncachedIds: CategoryId[] = [];

    for (const id of categoryIds) {
      const cached = this.cache.get(id as string);
      if (cached) {
        for (const ancestorId of cached) {
          allAncestors.add(ancestorId as string);
        }
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length > 0) {
      const rows = await this.dbClient.db
        .select({ id: discoveryCategories.id, ancestorIds: discoveryCategories.ancestorIds })
        .from(discoveryCategories)
        .where(inArray(discoveryCategories.id, uncachedIds as string[]));

      for (const row of rows) {
        const ancestors = row.ancestorIds
          .filter((aid) => aid !== row.id)
          .map((aid) => CategoryId.raw(aid));
        this.cache.set(row.id, ancestors);

        for (const ancestorId of ancestors) {
          allAncestors.add(ancestorId as string);
        }
      }

      // Кэшируем пустой результат для ID, которых нет в БД
      for (const id of uncachedIds) {
        if (!this.cache.has(id as string)) {
          this.cache.set(id as string, []);
        }
      }
    }

    // Исключаем сами входные ID — caller добавит их сам
    for (const id of categoryIds) {
      allAncestors.delete(id as string);
    }

    return [...allAncestors].map((id) => CategoryId.raw(id));
  }

  public async findRootCategoryIds(categoryIds: CategoryId[]): Promise<CategoryId[]> {
    if (categoryIds.length === 0) return [];

    const roots = new Set<string>();
    const uncachedIds: CategoryId[] = [];

    for (const id of categoryIds) {
      const cached = this.rootCache.get(id as string);
      if (cached) {
        roots.add(cached as string);
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length > 0) {
      const rows = await this.dbClient.db
        .select({ id: discoveryCategories.id, ancestorIds: discoveryCategories.ancestorIds })
        .from(discoveryCategories)
        .where(inArray(discoveryCategories.id, uncachedIds as string[]));

      for (const row of rows) {
        // ancestorIds[0] is the root; if empty or self — category is root itself
        const rootId = row.ancestorIds.length > 0 ? row.ancestorIds[0]! : row.id;
        const rootCategoryId = CategoryId.raw(rootId);
        this.rootCache.set(row.id, rootCategoryId);
        roots.add(rootId);
      }

      for (const id of uncachedIds) {
        if (!this.rootCache.has(id as string)) {
          // Category not in DB — treat itself as root
          this.rootCache.set(id as string, id);
          roots.add(id as string);
        }
      }
    }

    return [...roots].map((id) => CategoryId.raw(id));
  }

  public clearCache(): void {
    this.cache.clear();
    this.rootCache.clear();
  }
}

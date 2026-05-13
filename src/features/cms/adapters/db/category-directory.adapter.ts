import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { cmsCategories } from './schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import {
  type CategoryDirectoryStatus,
  type CategoryDirectoryView,
  CategoryDirectoryPort,
} from '@/kernel/application/ports/category-directory.js';
import { CategoryId, type MediaId, type TypeId } from '@/kernel/domain/ids.js';
import { AgeGroup } from '@/kernel/domain/vo/age-group.js';
import type { CategoryAttribute } from '@/kernel/domain/vo/category-attribute.js';

/**
 * Sanity net против циклов в parent_category_id (на случай corrupted state).
 * Иерархия категорий по бизнес-инвариантам не должна превышать ~5 уровней.
 */
const MAX_RECURSION_DEPTH = 50;

/**
 * TTL in-memory кеша. Категории меняются редко (CMS-операция),
 * читаются на каждом GET /categories. Инвалидация по событию
 * `category.changed` через `clearCache()`.
 */
const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };

@Injectable()
export class DrizzleCategoryDirectoryAdapter implements CategoryDirectoryPort {
  private readonly byId = new Map<string, CacheEntry<CategoryDirectoryView | null>>();
  private allPublished: CacheEntry<CategoryDirectoryView[]> | null = null;
  private readonly byParentId = new Map<string, CacheEntry<CategoryDirectoryView[]>>();
  private readonly descendants = new Map<string, CacheEntry<CategoryId[]>>();
  private readonly closureByKey = new Map<string, CacheEntry<CategoryId[]>>();

  public constructor(private readonly connectionPool: ConnectionPool) {}

  public clearCache(): void {
    this.byId.clear();
    this.allPublished = null;
    this.byParentId.clear();
    this.descendants.clear();
    this.closureByKey.clear();
  }

  public async findById(id: CategoryId): Promise<CategoryDirectoryView | null> {
    const key = id as string;
    const cached = this.readCache(this.byId, key);
    if (cached !== undefined) return cached;

    const rows = await this.connectionPool.db
      .select()
      .from(cmsCategories)
      .where(eq(cmsCategories.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      this.writeCache(this.byId, key, null);
      return null;
    }

    const ancestors = await this.computeAncestorIds([CategoryId.raw(row.id)]);
    const view = this.toView(row, ancestors.get(row.id) ?? []);
    this.writeCache(this.byId, key, view);
    return view;
  }

  public async findByIds(ids: readonly CategoryId[]): Promise<CategoryDirectoryView[]> {
    if (ids.length === 0) return [];

    const rows = await this.connectionPool.db
      .select()
      .from(cmsCategories)
      .where(inArray(cmsCategories.id, ids as CategoryId[]));

    if (rows.length === 0) return [];

    const ancestors = await this.computeAncestorIds(rows.map((r) => CategoryId.raw(r.id)));
    return rows.map((row) => this.toView(row, ancestors.get(row.id) ?? []));
  }

  public async findAllPublished(): Promise<CategoryDirectoryView[]> {
    if (this.allPublished && this.allPublished.expiresAt > Date.now()) {
      return this.allPublished.value;
    }

    const rows = await this.connectionPool.db
      .select()
      .from(cmsCategories)
      .where(eq(cmsCategories.status, 'published'))
      .orderBy(asc(cmsCategories.order), asc(cmsCategories.name));

    if (rows.length === 0) {
      this.allPublished = { value: [], expiresAt: Date.now() + CACHE_TTL_MS };
      return [];
    }

    const ancestors = await this.computeAncestorIds(rows.map((r) => CategoryId.raw(r.id)));
    const views = rows.map((row) => this.toView(row, ancestors.get(row.id) ?? []));
    this.allPublished = { value: views, expiresAt: Date.now() + CACHE_TTL_MS };
    return views;
  }

  public async findPublishedByParentId(
    parentId: CategoryId | null,
  ): Promise<CategoryDirectoryView[]> {
    const cacheKey = parentId === null ? '__root__' : (parentId as string);
    const cached = this.readCache(this.byParentId, cacheKey);
    if (cached !== undefined) return cached;

    const condition =
      parentId !== null
        ? and(
            eq(cmsCategories.status, 'published'),
            eq(cmsCategories.parentCategoryId, parentId as string),
          )
        : and(eq(cmsCategories.status, 'published'), isNull(cmsCategories.parentCategoryId));

    const rows = await this.connectionPool.db
      .select()
      .from(cmsCategories)
      .where(condition)
      .orderBy(asc(cmsCategories.order), asc(cmsCategories.name));

    if (rows.length === 0) {
      this.writeCache(this.byParentId, cacheKey, []);
      return [];
    }

    const ancestors = await this.computeAncestorIds(rows.map((r) => CategoryId.raw(r.id)));
    const views = rows.map((row) => this.toView(row, ancestors.get(row.id) ?? []));
    this.writeCache(this.byParentId, cacheKey, views);
    return views;
  }

  public async findDescendantIds(rootId: CategoryId): Promise<CategoryId[]> {
    const key = rootId as string;
    const cached = this.readCache(this.descendants, key);
    if (cached !== undefined) return cached;

    const result = await this.connectionPool.db.execute<{ id: string }>(sql`
      WITH RECURSIVE subtree AS (
        SELECT id, 0 AS depth FROM cms_categories
        WHERE id = ${rootId as string}::uuid AND status = 'published'
        UNION ALL
        SELECT c.id, s.depth + 1 FROM cms_categories c
        INNER JOIN subtree s ON c.parent_category_id = s.id
        WHERE c.status = 'published' AND s.depth < ${MAX_RECURSION_DEPTH}
      )
      SELECT id FROM subtree
    `);
    const ids = (result.rows as { id: string }[]).map((r) => CategoryId.raw(r.id));
    this.writeCache(this.descendants, key, ids);
    return ids;
  }

  public async findAncestorClosure(
    directIds: readonly CategoryId[],
  ): Promise<CategoryId[]> {
    if (directIds.length === 0) return [];

    const cacheKey = [...directIds].map(String).sort().join(',');
    const cached = this.readCache(this.closureByKey, cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.connectionPool.db.execute<{ id: string }>(sql`
      WITH RECURSIVE chain AS (
        SELECT id, parent_category_id, 0 AS depth FROM cms_categories
        WHERE id IN (${sql.join(
          directIds.map((id) => sql`${id as string}::uuid`),
          sql`, `,
        )})
        UNION
        SELECT p.id, p.parent_category_id, c.depth + 1 FROM cms_categories p
        INNER JOIN chain c ON c.parent_category_id = p.id
        WHERE c.depth < ${MAX_RECURSION_DEPTH}
      )
      SELECT DISTINCT id FROM chain
    `);

    const ids = (result.rows as { id: string }[]).map((r) => CategoryId.raw(r.id));
    this.writeCache(this.closureByKey, cacheKey, ids);
    return ids;
  }

  private async computeAncestorIds(
    categoryIds: CategoryId[],
  ): Promise<Map<string, CategoryId[]>> {
    if (categoryIds.length === 0) return new Map();

    const result = await this.connectionPool.db.execute<{
      seed_id: string;
      depth: number;
      ancestor_id: string;
    }>(sql`
      WITH RECURSIVE chain AS (
        SELECT
          c.id AS seed_id,
          c.id AS ancestor_id,
          c.parent_category_id AS parent_id,
          0 AS depth
        FROM cms_categories c
        WHERE c.id IN (${sql.join(
          categoryIds.map((id) => sql`${id as string}::uuid`),
          sql`, `,
        )})
        UNION ALL
        SELECT
          chain.seed_id,
          p.id AS ancestor_id,
          p.parent_category_id AS parent_id,
          chain.depth + 1 AS depth
        FROM cms_categories p
        INNER JOIN chain ON chain.parent_id = p.id
        WHERE chain.depth < ${MAX_RECURSION_DEPTH}
      )
      SELECT seed_id, depth, ancestor_id FROM chain
      ORDER BY seed_id, depth DESC
    `);

    const map = new Map<string, CategoryId[]>();
    for (const row of result.rows as { seed_id: string; depth: number; ancestor_id: string }[]) {
      const arr = map.get(row.seed_id) ?? [];
      arr.push(CategoryId.raw(row.ancestor_id));
      map.set(row.seed_id, arr);
    }
    return map;
  }

  private toView(
    row: typeof cmsCategories.$inferSelect,
    ancestorIds: CategoryId[],
  ): CategoryDirectoryView {
    return {
      categoryId: CategoryId.raw(row.id),
      parentCategoryId: row.parentCategoryId ? CategoryId.raw(row.parentCategoryId) : null,
      name: row.name,
      iconId: row.iconId as MediaId,
      order: row.order,
      status: row.status as CategoryDirectoryStatus,
      allowedTypeIds: (row.allowedTypeIds as string[]).map((id) => id as TypeId),
      ancestorIds,
      ageGroups: (row.ageGroups as string[]).map(AgeGroup.restore),
      attributes: row.attributes as CategoryAttribute[],
      publishedAt: row.publishedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private readCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = map.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
    map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}

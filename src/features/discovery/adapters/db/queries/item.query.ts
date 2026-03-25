import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';

import { ItemQueryPort } from '../../../application/ports.js';
import type {
  CategoryItemFilters,
  SortOption,
} from '../../../application/use-cases/browse-category/types.js';
import type { ItemReadModel } from '../../../domain/read-models/item.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import {
  discoveryItemAttributes,
  discoveryItemCategories,
  discoveryItemEventDates,
  discoveryItemSchedules,
  discoveryItems,
} from '../schema.js';
import { decodeCursor, encodeCursor } from '@/infra/lib/pagination/index.js';
import {
  AttributeId,
  CategoryId,
  MediaId,
  ItemId,
  OrganizationId,
  TypeId,
} from '@/kernel/domain/ids.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import type { ItemWidget, PaymentStrategy, ScheduleEntry } from '@/kernel/domain/vo/widget.js';

@Injectable()
export class DrizzleItemQuery implements ItemQueryPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findById(itemId: ItemId): Promise<ItemReadModel | null> {
    const rows = await this.dbClient.db
      .select()
      .from(discoveryItems)
      .where(eq(discoveryItems.id, itemId as string));

    if (rows.length === 0) return null;

    const models = await this.hydrateReadModels(rows);
    return models[0] ?? null;
  }

  public async findByIds(ids: ItemId[]): Promise<ItemReadModel[]> {
    if (ids.length === 0) return [];

    const rows = await this.dbClient.db
      .select()
      .from(discoveryItems)
      .where(inArray(discoveryItems.id, ids as string[]));

    return this.hydrateReadModels(rows);
  }

  public async findCategoryItemsSorted(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroupOption;
    filters: CategoryItemFilters;
    sort: Exclude<SortOption, 'personal'>;
    includeIds?: ItemId[];
    excludeIds?: ItemId[];
    cursor?: string;
    limit: number;
  }): Promise<{ items: ItemReadModel[]; nextCursor: string | null }> {
    const conditions: SQL[] = [
      sql`EXISTS (SELECT 1 FROM ${discoveryItemCategories} WHERE ${discoveryItemCategories.itemId} = ${discoveryItems.id} AND ${discoveryItemCategories.categoryId} = ${params.categoryId as string})`,
      eq(discoveryItems.cityId, params.cityId),
      sql`(${discoveryItems.ageGroup} = ${params.ageGroup} OR ${discoveryItems.ageGroup} = 'all')`,
    ];

    if (params.includeIds && params.includeIds.length > 0) {
      conditions.push(inArray(discoveryItems.id, params.includeIds as string[]));
    }

    if (params.excludeIds && params.excludeIds.length > 0) {
      conditions.push(notInArray(discoveryItems.id, params.excludeIds as string[]));
    }

    this.applyFilters(conditions, params.filters);

    const { orderBy, cursorCondition } = this.buildSortAndCursor(params.sort, params.cursor);
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const rows = await this.dbClient.db
      .select()
      .from(discoveryItems)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const resultRows = hasMore ? rows.slice(0, params.limit) : rows;

    const items = await this.hydrateReadModels(resultRows);
    const lastRow = resultRows.at(-1);
    const nextCursor = hasMore && lastRow ? this.buildCursor(params.sort, lastRow) : null;

    return { items, nextCursor };
  }

  private buildSortAndCursor(
    sort: Exclude<SortOption, 'personal'>,
    cursor?: string,
  ): { orderBy: SQL[]; cursorCondition: SQL | null } {
    const parsed = cursor ? decodeCursor<{ value: string; id: string }>(cursor) : null;

    switch (sort) {
      case 'price-asc': {
        const orderBy = [asc(discoveryItems.minPrice), asc(discoveryItems.id)];
        const cursorCondition = parsed
          ? sql`(${discoveryItems.minPrice}, ${discoveryItems.id}) > (${parsed.value}, ${parsed.id})`
          : null;
        return { orderBy, cursorCondition };
      }
      case 'price-desc': {
        const orderBy = [desc(discoveryItems.minPrice), asc(discoveryItems.id)];
        const cursorCondition = parsed
          ? sql`(${discoveryItems.minPrice}, ${discoveryItems.id}) < (${parsed.value}, ${parsed.id})`
          : null;
        return { orderBy, cursorCondition };
      }
      case 'rating-desc': {
        const orderBy = [desc(discoveryItems.itemRating), asc(discoveryItems.id)];
        const cursorCondition = parsed
          ? sql`(${discoveryItems.itemRating}, ${discoveryItems.id}) < (${parsed.value}, ${parsed.id})`
          : null;
        return { orderBy, cursorCondition };
      }
      case 'newest': {
        const orderBy = [desc(discoveryItems.publishedAt), asc(discoveryItems.id)];
        const cursorCondition = parsed
          ? sql`(${discoveryItems.publishedAt}, ${discoveryItems.id}) < (${parsed.value}, ${parsed.id})`
          : null;
        return { orderBy, cursorCondition };
      }
    }
  }

  private buildCursor(
    sort: Exclude<SortOption, 'personal'>,
    row: typeof discoveryItems.$inferSelect,
  ): string {
    let value: string;
    switch (sort) {
      case 'price-asc':
      case 'price-desc':
        value = row.minPrice ?? '0';
        break;
      case 'rating-desc':
        value = row.itemRating ?? '0';
        break;
      case 'newest':
        value = row.publishedAt.toISOString();
        break;
    }
    return encodeCursor({ value, id: row.id });
  }

  private applyFilters(conditions: SQL[], filters: CategoryItemFilters): void {
    if (filters.typeIds && filters.typeIds.length > 0) {
      conditions.push(inArray(discoveryItems.typeId, filters.typeIds as string[]));
    }
    if (filters.priceRange?.min !== undefined && filters.priceRange?.min !== null) {
      conditions.push(gte(discoveryItems.minPrice, String(filters.priceRange.min)));
    }
    if (filters.priceRange?.max !== undefined && filters.priceRange?.max !== null) {
      conditions.push(lte(discoveryItems.minPrice, String(filters.priceRange.max)));
    }
    if (filters.minRating !== undefined && filters.minRating !== null) {
      conditions.push(gte(discoveryItems.itemRating, String(filters.minRating)));
    }
    if (filters.attributeFilters && filters.attributeFilters.length > 0) {
      for (const af of filters.attributeFilters) {
        switch (af.type) {
          case 'enum':
            if (af.values.length > 0) {
              conditions.push(
                sql`EXISTS (SELECT 1 FROM ${discoveryItemAttributes} WHERE ${discoveryItemAttributes.itemId} = ${discoveryItems.id} AND ${discoveryItemAttributes.attributeId} = ${String(af.attributeId)} AND ${discoveryItemAttributes.value} IN (${sql.join(
                  af.values.map((v) => sql`${v}`),
                  sql`, `,
                )}))`,
              );
            }
            break;
          case 'number': {
            const numConditions: SQL[] = [
              sql`${discoveryItemAttributes.itemId} = ${discoveryItems.id}`,
              sql`${discoveryItemAttributes.attributeId} = ${String(af.attributeId)}`,
            ];
            if (af.min !== undefined) {
              numConditions.push(sql`${discoveryItemAttributes.value}::numeric >= ${af.min}`);
            }
            if (af.max !== undefined) {
              numConditions.push(sql`${discoveryItemAttributes.value}::numeric <= ${af.max}`);
            }
            conditions.push(
              sql`EXISTS (SELECT 1 FROM ${discoveryItemAttributes} WHERE ${sql.join(numConditions, sql` AND `)})`,
            );
            break;
          }
          case 'boolean':
            conditions.push(
              sql`EXISTS (SELECT 1 FROM ${discoveryItemAttributes} WHERE ${discoveryItemAttributes.itemId} = ${discoveryItems.id} AND ${discoveryItemAttributes.attributeId} = ${String(af.attributeId)} AND ${discoveryItemAttributes.value} = ${String(af.value)})`,
            );
            break;
          case 'text':
            conditions.push(
              sql`EXISTS (SELECT 1 FROM ${discoveryItemAttributes} WHERE ${discoveryItemAttributes.itemId} = ${discoveryItems.id} AND ${discoveryItemAttributes.attributeId} = ${String(af.attributeId)} AND ${discoveryItemAttributes.value} ILIKE ${`%${af.value}%`})`,
            );
            break;
        }
      }
    }
    if (filters.geoRadius) {
      const { lat, lng, radiusKm } = filters.geoRadius;
      conditions.push(
        sql`(6371 * acos(least(1.0, cos(radians(${lat})) * cos(radians(${discoveryItems.lat})) * cos(radians(${discoveryItems.lng}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${discoveryItems.lat}))))) <= ${radiusKm}`,
      );
    }
    if (filters.dateRange) {
      const from = filters.dateRange.from.toISOString();
      const to = filters.dateRange.to.toISOString();
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${discoveryItemEventDates} WHERE ${discoveryItemEventDates.itemId} = ${discoveryItems.id} AND ${discoveryItemEventDates.eventDate} BETWEEN ${from}::timestamptz AND ${to}::timestamptz)`,
      );
    }
    if (filters.scheduleDayOfWeek !== undefined) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${discoveryItemSchedules} WHERE ${discoveryItemSchedules.itemId} = ${discoveryItems.id} AND ${discoveryItemSchedules.dayOfWeek} = ${filters.scheduleDayOfWeek})`,
      );
    }
    if (filters.scheduleTimeOfDay) {
      const { from, to } = filters.scheduleTimeOfDay;
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${discoveryItemSchedules} WHERE ${discoveryItemSchedules.itemId} = ${discoveryItems.id} AND ${discoveryItemSchedules.startTime} < ${to} AND ${discoveryItemSchedules.endTime} > ${from})`,
      );
    }
  }

  private async hydrateReadModels(
    rows: (typeof discoveryItems.$inferSelect)[],
  ): Promise<ItemReadModel[]> {
    if (rows.length === 0) return [];

    const itemIds = rows.map((r) => r.id);

    const [categories, attributes, eventDates, schedules] = await Promise.all([
      this.dbClient.db
        .select()
        .from(discoveryItemCategories)
        .where(inArray(discoveryItemCategories.itemId, itemIds)),
      this.dbClient.db
        .select()
        .from(discoveryItemAttributes)
        .where(inArray(discoveryItemAttributes.itemId, itemIds)),
      this.dbClient.db
        .select()
        .from(discoveryItemEventDates)
        .where(inArray(discoveryItemEventDates.itemId, itemIds)),
      this.dbClient.db
        .select()
        .from(discoveryItemSchedules)
        .where(inArray(discoveryItemSchedules.itemId, itemIds)),
    ]);

    const catsByItem = this.groupBy(categories, (r) => r.itemId);
    const attrsByItem = this.groupBy(attributes, (r) => r.itemId);
    const datesByItem = this.groupBy(eventDates, (r) => r.itemId);
    const schedsByItem = this.groupBy(schedules, (r) => r.itemId);

    return rows.map((row) =>
      this.toReadModel(
        row,
        catsByItem.get(row.id) ?? [],
        attrsByItem.get(row.id) ?? [],
        datesByItem.get(row.id) ?? [],
        schedsByItem.get(row.id) ?? [],
      ),
    );
  }

  private toReadModel(
    row: typeof discoveryItems.$inferSelect,
    categories: (typeof discoveryItemCategories.$inferSelect)[],
    attributes: (typeof discoveryItemAttributes.$inferSelect)[],
    eventDates: (typeof discoveryItemEventDates.$inferSelect)[],
    schedules: (typeof discoveryItemSchedules.$inferSelect)[],
  ): ItemReadModel {
    const model: ItemReadModel = {
      itemId: ItemId.raw(row.id),
      typeId: TypeId.raw(row.typeId),
      widgets: (row.widgets ?? []) as ItemWidget[],
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    };

    if (row.title !== null) {
      model.baseInfo = {
        title: row.title,
        description: row.description ?? '',
        media: (row.media ?? []).map((m) => ({ type: m.type, mediaId: MediaId.raw(m.mediaId) })) as MediaItem[],
      };
    }

    if (row.ageGroup !== null) {
      model.ageGroup = row.ageGroup as AgeGroupOption;
    }

    if (row.cityId !== null) {
      model.location = {
        cityId: row.cityId,
        coordinates: { lat: row.lat ?? 0, lng: row.lng ?? 0 },
        address: row.address,
      };
    }

    if (row.paymentOptions !== null && row.paymentOptions !== undefined) {
      model.payment = {
        options: (row.paymentOptions as { name: string; description: string | null; strategy: string; price: number | null }[]).map((o) => ({
          name: o.name,
          description: o.description,
          strategy: o.strategy as PaymentStrategy,
          price: o.price,
        })),
      };
    }

    if (categories.length > 0) {
      model.category = {
        categoryIds: categories.map((c) => CategoryId.raw(c.categoryId)),
        attributeValues: attributes.map((a) => ({
          attributeId: AttributeId.raw(a.attributeId),
          value: a.value,
        })),
      };
    }

    if (row.organizationId !== null) {
      model.owner = {
        organizationId: OrganizationId.raw(row.organizationId),
        name: row.ownerName ?? '',
        avatarId: row.ownerAvatarId ? MediaId.raw(row.ownerAvatarId) : null,
      };
    }

    if (row.itemRating !== null || row.itemReviewCount > 0) {
      model.itemReview = {
        rating: row.itemRating !== null ? Number(row.itemRating) : null,
        reviewCount: row.itemReviewCount,
      };
    }

    if (row.ownerRating !== null || row.ownerReviewCount > 0) {
      model.ownerReview = {
        rating: row.ownerRating !== null ? Number(row.ownerRating) : null,
        reviewCount: row.ownerReviewCount,
      };
    }

    if (eventDates.length > 0) {
      model.eventDateTime = { dates: eventDates.map((d) => ({ date: d.eventDate, label: d.label ?? undefined })) };
    }

    if (schedules.length > 0) {
      model.schedule = {
        entries: schedules.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })) as ScheduleEntry[],
      };
    }

    return model;
  }

  private groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const key = keyFn(item);
      const arr = map.get(key);
      if (arr) {
        arr.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    return map;
  }
}

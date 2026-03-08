import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { ItemQueryPort } from '../../../application/ports.js';
import type {
  CategoryItemFilters,
  SortOption,
} from '../../../application/use-cases/get-category-items/types.js';
import type { ItemReadModel } from '../../../domain/read-models/item.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryItems } from '../schema.js';
import {
  ItemId,
  TypeId,
  CategoryId,
  AttributeId,
  OrganizationId,
  FileId,
} from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';
import type { PaymentStrategy, ScheduleEntry } from '@/kernel/domain/vo/widget.js';

@Injectable()
export class DrizzleItemQuery implements ItemQueryPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findByIds(ids: ItemId[]): Promise<ItemReadModel[]> {
    if (ids.length === 0) return [];

    const rows = await this.dbClient.db
      .select()
      .from(discoveryItems)
      .where(inArray(discoveryItems.id, ids as string[]));

    return rows.map((row) => this.toReadModel(row));
  }

  public async findCategoryItemsSorted(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    sort: Exclude<SortOption, 'personal'>;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ItemReadModel[]; nextCursor: string | null }> {
    const conditions: SQL[] = [
      sql`${discoveryItems.categoryIds} @> ${JSON.stringify([params.categoryId])}::jsonb`,
      eq(discoveryItems.cityId, params.cityId),
      sql`(${discoveryItems.ageGroup} = ${params.ageGroup} OR ${discoveryItems.ageGroup} = 'all')`,
    ];

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

    const items = resultRows.map((row) => this.toReadModel(row));
    const nextCursor = hasMore
      ? this.encodeCursor(params.sort, resultRows[resultRows.length - 1]!)
      : null;

    return { items, nextCursor };
  }

  public async findPopular(params: {
    cityId: string;
    ageGroup: AgeGroup;
    limit: number;
  }): Promise<ItemReadModel[]> {
    const rows = await this.dbClient.db
      .select()
      .from(discoveryItems)
      .where(
        and(
          eq(discoveryItems.cityId, params.cityId),
          sql`(${discoveryItems.ageGroup} = ${params.ageGroup} OR ${discoveryItems.ageGroup} = 'all')`,
        ),
      )
      .orderBy(desc(discoveryItems.itemReviewCount))
      .limit(params.limit);

    return rows.map((row) => this.toReadModel(row));
  }

  private buildSortAndCursor(
    sort: Exclude<SortOption, 'personal'>,
    cursor?: string,
  ): { orderBy: SQL[]; cursorCondition: SQL | null } {
    const parsed = cursor ? this.decodeCursor(cursor) : null;

    switch (sort) {
      case 'price-asc': {
        const orderBy = [asc(discoveryItems.price), asc(discoveryItems.id)];
        const cursorCondition = parsed
          ? sql`(${discoveryItems.price}, ${discoveryItems.id}) > (${parsed.value}, ${parsed.id})`
          : null;
        return { orderBy, cursorCondition };
      }
      case 'price-desc': {
        const orderBy = [desc(discoveryItems.price), asc(discoveryItems.id)];
        const cursorCondition = parsed
          ? sql`(${discoveryItems.price}, ${discoveryItems.id}) < (${parsed.value}, ${parsed.id})`
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

  private encodeCursor(
    sort: Exclude<SortOption, 'personal'>,
    row: typeof discoveryItems.$inferSelect,
  ): string {
    let value: string;
    switch (sort) {
      case 'price-asc':
      case 'price-desc':
        value = row.price ?? '0';
        break;
      case 'rating-desc':
        value = row.itemRating ?? '0';
        break;
      case 'newest':
        value = row.publishedAt.toISOString();
        break;
    }
    return Buffer.from(JSON.stringify({ value, id: row.id })).toString('base64url');
  }

  private decodeCursor(cursor: string): { value: string; id: string } {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as {
      value: string;
      id: string;
    };
  }

  private applyFilters(conditions: SQL[], filters: CategoryItemFilters): void {
    if (filters.typeIds && filters.typeIds.length > 0) {
      conditions.push(inArray(discoveryItems.typeId, filters.typeIds as string[]));
    }
    if (filters.priceRange?.min != null) {
      conditions.push(gte(discoveryItems.price, String(filters.priceRange.min)));
    }
    if (filters.priceRange?.max != null) {
      conditions.push(lte(discoveryItems.price, String(filters.priceRange.max)));
    }
    if (filters.minRating != null) {
      conditions.push(gte(discoveryItems.itemRating, String(filters.minRating)));
    }
  }

  private toReadModel(row: typeof discoveryItems.$inferSelect): ItemReadModel {
    const model: ItemReadModel = {
      itemId: ItemId.raw(row.id),
      typeId: TypeId.raw(row.typeId),
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    };

    if (row.title != null) {
      model.baseInfo = {
        title: row.title,
        description: row.description ?? '',
        imageId: row.imageId ? FileId.raw(row.imageId) : null,
      };
    }

    if (row.ageGroup != null) {
      model.ageGroup = row.ageGroup as AgeGroup;
    }

    if (row.cityId != null) {
      model.location = {
        cityId: row.cityId,
        coordinates: { lat: row.lat ?? 0, lng: row.lng ?? 0 },
        address: row.address,
      };
    }

    if (row.paymentStrategy != null) {
      model.payment = {
        strategy: row.paymentStrategy as PaymentStrategy,
        price: row.price != null ? Number(row.price) : null,
      };
    }

    if (row.categoryIds.length > 0) {
      model.category = {
        categoryIds: row.categoryIds.map((id) => CategoryId.raw(id)),
        attributeValues: row.attributeValues.map((av) => ({
          attributeId: AttributeId.raw(av.attributeId),
          value: av.value,
        })),
      };
    }

    if (row.organizationId != null) {
      model.owner = {
        organizationId: OrganizationId.raw(row.organizationId),
        name: row.ownerName ?? '',
        avatarId: row.ownerAvatarId ? FileId.raw(row.ownerAvatarId) : null,
      };
    }

    if (row.itemRating != null || row.itemReviewCount > 0) {
      model.itemReview = {
        rating: row.itemRating != null ? Number(row.itemRating) : null,
        reviewCount: row.itemReviewCount,
      };
    }

    if (row.ownerRating != null || row.ownerReviewCount > 0) {
      model.ownerReview = {
        rating: row.ownerRating != null ? Number(row.ownerRating) : null,
        reviewCount: row.ownerReviewCount,
      };
    }

    if (row.eventDates != null) {
      model.eventDateTime = { dates: row.eventDates.map((d) => new Date(d)) };
    }

    if (row.scheduleEntries != null) {
      model.schedule = { entries: row.scheduleEntries as ScheduleEntry[] };
    }

    return model;
  }
}

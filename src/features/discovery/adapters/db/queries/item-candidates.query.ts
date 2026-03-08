import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { ItemCandidatesPort } from '../../../application/ports.js';
import type { CategoryItemFilters } from '../../../application/use-cases/get-category-items/types.js';
import type { PostRankingCandidate } from '../../../domain/read-models/post-ranking-candidate.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryItems } from '../schema.js';
import type { CategoryId } from '@/kernel/domain/ids.js';
import { ItemId, OrganizationId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

@Injectable()
export class DrizzleItemCandidatesQuery implements ItemCandidatesPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findCategoryCandidates(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    cap: number;
  }): Promise<PostRankingCandidate[]> {
    const conditions = [
      sql`${discoveryItems.categoryIds} @> ${JSON.stringify([params.categoryId])}::jsonb`,
      eq(discoveryItems.cityId, params.cityId),
      sql`(${discoveryItems.ageGroup} = ${params.ageGroup} OR ${discoveryItems.ageGroup} = 'all')`,
    ];

    this.applyFilters(conditions, params.filters);

    const rows = await this.dbClient.db
      .select({
        id: discoveryItems.id,
        organizationId: discoveryItems.organizationId,
        eventDates: discoveryItems.eventDates,
        scheduleEntries: discoveryItems.scheduleEntries,
      })
      .from(discoveryItems)
      .where(and(...conditions))
      .limit(params.cap);

    return rows.map((row) => ({
      itemId: ItemId.raw(row.id),
      ownerId: OrganizationId.raw(row.organizationId ?? ''),
      nextEventDate: this.getNextEventDate(row.eventDates),
      hasSchedule: (row.scheduleEntries?.length ?? 0) > 0,
    }));
  }

  private getNextEventDate(eventDates: string[] | null): Date | null {
    if (!eventDates || eventDates.length === 0) return null;
    const now = new Date();
    const future = eventDates
      .map((d) => new Date(d))
      .filter((d) => d >= now)
      .sort((a, b) => a.getTime() - b.getTime());
    return future[0] ?? null;
  }

  private applyFilters(conditions: ReturnType<typeof eq>[], filters: CategoryItemFilters): void {
    if (filters.typeIds && filters.typeIds.length > 0) {
      conditions.push(inArray(discoveryItems.typeId, filters.typeIds as string[]));
    }
    if (filters.priceRange?.min !== null) {
      conditions.push(gte(discoveryItems.price, String(filters.priceRange.min)));
    }
    if (filters.priceRange?.max !== null) {
      conditions.push(lte(discoveryItems.price, String(filters.priceRange.max)));
    }
    if (filters.minRating !== null) {
      conditions.push(gte(discoveryItems.itemRating, String(filters.minRating)));
    }
  }
}

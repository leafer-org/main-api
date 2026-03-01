import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, SQL } from 'drizzle-orm';

import {
  type PaginatedResult,
  ServiceDetailQueryPort,
  ServiceFeedQueryPort,
  ServiceSearchQueryPort,
} from '../../application/ports.js';
import type { ServiceListingReadModel } from '../../domain/read-models/service-listing/service-listing.read-model.js';
import { DiscoveryDatabaseClient } from './client.js';
import { serviceListings } from './schema.js';
import type { CategoryId } from '@/kernel/domain/ids.js';
import { ServiceId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';
import type { ServiceComponent } from '@/kernel/domain/vo/service-component.js';

@Injectable()
export class DrizzleDiscoveryQuery
  implements ServiceFeedQueryPort, ServiceSearchQueryPort, ServiceDetailQueryPort
{
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findFeed(params: {
    cursor?: string;
    limit: number;
    ageGroup?: AgeGroup;
    categoryId?: CategoryId;
  }): Promise<PaginatedResult<ServiceListingReadModel>> {
    return this.queryWithFilters(params);
  }

  public async search(params: {
    query?: string;
    categoryId?: CategoryId;
    ageGroup?: AgeGroup;
    cursor?: string;
    limit: number;
  }): Promise<PaginatedResult<ServiceListingReadModel>> {
    return this.queryWithFilters(params);
  }

  public async findByServiceId(serviceId: ServiceId): Promise<ServiceListingReadModel | null> {
    const rows = await this.dbClient.db
      .select()
      .from(serviceListings)
      .where(eq(serviceListings.serviceId, serviceId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);
  }

  private async queryWithFilters(params: {
    query?: string;
    categoryId?: CategoryId;
    ageGroup?: AgeGroup;
    cursor?: string;
    limit: number;
  }): Promise<PaginatedResult<ServiceListingReadModel>> {
    const conditions: SQL[] = [];

    if (params.categoryId) {
      conditions.push(eq(serviceListings.categoryId, params.categoryId));
    }
    if (params.ageGroup) {
      conditions.push(eq(serviceListings.ageGroup, params.ageGroup));
    }
    if (params.cursor) {
      conditions.push(gt(serviceListings.serviceId, params.cursor));
    }

    const rows = await this.dbClient.db
      .select()
      .from(serviceListings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(serviceListings.publishedAt))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const items = (hasMore ? rows.slice(0, params.limit) : rows).map((row) => this.toDomain(row));
    const nextCursor = hasMore ? (items.at(-1)?.serviceId ?? null) : null;

    return { items, nextCursor };
  }

  private toDomain(row: typeof serviceListings.$inferSelect): ServiceListingReadModel {
    return {
      serviceId: ServiceId.raw(row.serviceId),
      components: row.components as ServiceComponent[],
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import { NewSellerItemsPort } from '../../../application/ports.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryItems } from '../schema.js';
import { ItemId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

@Injectable()
export class DrizzleNewSellerItemsQuery implements NewSellerItemsPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findNewSellerItems(params: {
    cityId: string;
    ageGroup: AgeGroup;
    limit: number;
  }): Promise<ItemId[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find items from organizations whose first publishedAt is within last 30 days
    const newSellerOrgs = this.dbClient.db
      .select({ organizationId: discoveryItems.organizationId })
      .from(discoveryItems)
      .groupBy(discoveryItems.organizationId)
      .having(gte(sql`min(${discoveryItems.publishedAt})`, thirtyDaysAgo))
      .as('new_seller_orgs');

    const rows = await this.dbClient.db
      .select({ id: discoveryItems.id })
      .from(discoveryItems)
      .innerJoin(newSellerOrgs, eq(discoveryItems.organizationId, newSellerOrgs.organizationId))
      .where(
        and(
          eq(discoveryItems.cityId, params.cityId),
          sql`(${discoveryItems.ageGroup} = ${params.ageGroup} OR ${discoveryItems.ageGroup} = 'all')`,
        ),
      )
      .orderBy(desc(discoveryItems.publishedAt))
      .limit(params.limit);

    return rows.map((row) => ItemId.raw(row.id));
  }
}

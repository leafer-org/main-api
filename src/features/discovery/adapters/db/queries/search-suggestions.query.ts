import { Injectable } from '@nestjs/common';
import { and, desc, ilike, ne, sql } from 'drizzle-orm';

import { SearchSuggestionsQueryPort } from '../../../application/ports.js';
import type {
  CategorySuggestion,
  ItemTypeSuggestion,
  OrganizationSuggestion,
  QuerySuggestion,
} from '../../../domain/read-models/search-suggestion.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import {
  discoveryCategories,
  discoveryItemTypes,
  discoveryOwners,
  discoverySearchLog,
} from '../schema.js';
import { CategoryId, MediaId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleSearchSuggestionsQuery implements SearchSuggestionsQueryPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findCategoriesByName(query: string, limit: number): Promise<CategorySuggestion[]> {
    const rows = await this.dbClient.db
      .select({ id: discoveryCategories.id, name: discoveryCategories.name })
      .from(discoveryCategories)
      .where(ilike(discoveryCategories.name, `%${escapeLike(query)}%`))
      .orderBy(sql`length(${discoveryCategories.name})`)
      .limit(limit);

    return rows.map((r) => ({ categoryId: CategoryId.raw(r.id), name: r.name }));
  }

  public async findItemTypesByName(query: string, limit: number): Promise<ItemTypeSuggestion[]> {
    const rows = await this.dbClient.db
      .select({ id: discoveryItemTypes.id, name: discoveryItemTypes.name })
      .from(discoveryItemTypes)
      .where(ilike(discoveryItemTypes.name, `%${escapeLike(query)}%`))
      .orderBy(sql`length(${discoveryItemTypes.name})`)
      .limit(limit);

    return rows.map((r) => ({
      typeId: TypeId.raw(r.id),
      name: r.name,
      parentCategoryId: null,
    }));
  }

  public async findOrganizationsByName(
    query: string,
    limit: number,
  ): Promise<OrganizationSuggestion[]> {
    const rows = await this.dbClient.db
      .select({
        id: discoveryOwners.id,
        name: discoveryOwners.name,
        avatarId: discoveryOwners.avatarId,
      })
      .from(discoveryOwners)
      .where(ilike(discoveryOwners.name, `%${escapeLike(query)}%`))
      .orderBy(sql`length(${discoveryOwners.name})`)
      .limit(limit);

    return rows.map((r) => ({
      organizationId: OrganizationId.raw(r.id),
      name: r.name,
      avatarId: r.avatarId ? MediaId.raw(r.avatarId) : null,
    }));
  }

  public async findPopularQueries(
    cityId: string,
    query: string,
    limit: number,
  ): Promise<QuerySuggestion[]> {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return [];

    const rows = await this.dbClient.db
      .select({ query: discoverySearchLog.query })
      .from(discoverySearchLog)
      .where(
        and(
          sql`${discoverySearchLog.cityId} = ${cityId}`,
          ilike(discoverySearchLog.query, `%${escapeLike(normalized)}%`),
          ne(discoverySearchLog.query, normalized),
        ),
      )
      .orderBy(desc(discoverySearchLog.count), desc(discoverySearchLog.lastUsedAt))
      .limit(limit);

    return rows.map((r) => ({ text: r.query }));
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

import { Inject, Injectable } from '@nestjs/common';
import { and, desc, ilike, inArray, ne, sql } from 'drizzle-orm';

import {
  DISCOVERY_CATEGORIES_SEARCH_INDEX,
  DiscoveryCategoriesSearchClient,
} from '../../meilisearch/discovery-categories-search.index.js';
import {
  DISCOVERY_ITEM_TYPES_SEARCH_INDEX,
  DiscoveryItemTypesSearchClient,
} from '../../meilisearch/discovery-item-types-search.index.js';
import {
  DISCOVERY_ORGANIZATIONS_SEARCH_INDEX,
  DiscoveryOrganizationsSearchClient,
} from '../../meilisearch/discovery-organizations-search.index.js';
import { SearchSuggestionsQueryPort } from '../../../application/ports.js';
import type {
  CategorySuggestion,
  ItemTypeSuggestion,
  OrganizationSuggestion,
  QuerySuggestion,
} from '../../../domain/read-models/search-suggestion.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryOwners, discoverySearchLog } from '../schema.js';
import { CategoryId, MediaId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';

type CategorySearchHit = { categoryId: string; name: string };
type ItemTypeSearchHit = { typeId: string; name: string };
type OrganizationSearchHit = { organizationId: string };

@Injectable()
export class DrizzleSearchSuggestionsQuery implements SearchSuggestionsQueryPort {
  public constructor(
    private readonly dbClient: DiscoveryDatabaseClient,
    @Inject(DiscoveryCategoriesSearchClient)
    private readonly categoriesSearchClient: InstanceType<typeof DiscoveryCategoriesSearchClient>,
    @Inject(DiscoveryItemTypesSearchClient)
    private readonly itemTypesSearchClient: InstanceType<typeof DiscoveryItemTypesSearchClient>,
    @Inject(DiscoveryOrganizationsSearchClient)
    private readonly organizationsSearchClient: InstanceType<
      typeof DiscoveryOrganizationsSearchClient
    >,
  ) {}

  public async findCategoriesByName(query: string, limit: number): Promise<CategorySuggestion[]> {
    const result = await this.categoriesSearchClient.search<CategorySearchHit>(
      DISCOVERY_CATEGORIES_SEARCH_INDEX,
      { q: query, limit },
    );
    return result.hits.map((h) => ({ categoryId: CategoryId.raw(h.categoryId), name: h.name }));
  }

  public async findItemTypesByName(query: string, limit: number): Promise<ItemTypeSuggestion[]> {
    const result = await this.itemTypesSearchClient.search<ItemTypeSearchHit>(
      DISCOVERY_ITEM_TYPES_SEARCH_INDEX,
      { q: query, limit },
    );
    return result.hits.map((h) => ({
      typeId: TypeId.raw(h.typeId),
      name: h.name,
      parentCategoryId: null,
    }));
  }

  public async findOrganizationsByName(
    query: string,
    limit: number,
  ): Promise<OrganizationSuggestion[]> {
    // Поиск имени — в Meili (typo-tolerance, морфология).
    const result = await this.organizationsSearchClient.search<OrganizationSearchHit>(
      DISCOVERY_ORGANIZATIONS_SEARCH_INDEX,
      { q: query, limit },
    );
    if (result.hits.length === 0) return [];

    const ids = result.hits.map((h) => h.organizationId);
    // Обогащаем avatarId/name из discovery_owners (denormalized snapshot).
    const rows = await this.dbClient.db
      .select({
        id: discoveryOwners.id,
        name: discoveryOwners.name,
        avatarId: discoveryOwners.avatarId,
      })
      .from(discoveryOwners)
      .where(inArray(discoveryOwners.id, ids));

    const byId = new Map(rows.map((r) => [r.id, r]));
    // Сохраняем порядок, заданный Meili (по релевантности).
    return result.hits
      .map((hit) => byId.get(hit.organizationId))
      .filter((r): r is { id: string; name: string; avatarId: string | null } => r !== undefined)
      .map((r) => ({
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

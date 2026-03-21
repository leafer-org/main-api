import { Inject, Injectable } from '@nestjs/common';

import { SearchPort } from '../../application/ports.js';
import type { DynamicSearchFilters } from '../../application/use-cases/search/types.js';
import type { ItemListView } from '../../domain/read-models/item-list-view.read-model.js';
import type { SearchFacets } from '../../domain/read-models/search-result.read-model.js';
import { DISCOVERY_ITEMS_INDEX, DiscoveryItemsSearchClient } from './discovery-items.index.js';
import { decodeCursor, encodeCursor } from '@/infra/lib/pagination/index.js';
import { CategoryId, MediaId, ItemId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { PaymentStrategy } from '@/kernel/domain/vo/widget.js';

type DiscoveryItemHit = {
  itemId: string;
  typeId: string;
  title: string;
  description: string;
  media: { type: string; mediaId: string }[];
  price: number | null;
  paymentStrategies: string[];
  rating: number | null;
  reviewCount: number;
  ownerName: string;
  ownerAvatarId: string | null;
  cityId: string | null;
  address: string;
  categoryIds: string[];
};

@Injectable()
export class MeiliSearchQuery implements SearchPort {
  public constructor(
    @Inject(DiscoveryItemsSearchClient)
    private readonly searchClient: InstanceType<typeof DiscoveryItemsSearchClient>,
  ) {}

  public async search(params: {
    query: string;
    cityId: string;
    ageGroup: AgeGroupOption;
    filters?: DynamicSearchFilters;
    cursor?: string;
    limit: number;
  }): Promise<{
    items: ItemListView[];
    facets: SearchFacets;
    nextCursor: string | null;
    total: number;
  }> {
    const filterParts: string[] = [
      `cityId = "${params.cityId}"`,
      `(ageGroup = "${params.ageGroup}" OR ageGroup = "all")`,
    ];

    if (params.filters) {
      this.applyDynamicFilters(filterParts, params.filters);
    }

    const offset = params.cursor ? decodeCursor<{ offset: number }>(params.cursor).offset : 0;

    const result = await this.searchClient.search<DiscoveryItemHit>(DISCOVERY_ITEMS_INDEX, {
      q: params.query,
      filter: filterParts.join(' AND '),
      offset,
      limit: params.limit,
    });

    const items = result.hits.map((hit) => this.toItemListView(hit));
    const nextCursor =
      result.total > offset + params.limit ? encodeCursor({ offset: offset + params.limit }) : null;

    return {
      items,
      facets: { categories: [], types: [], priceRange: null, attributes: [] },
      nextCursor,
      total: result.total,
    };
  }

  private applyDynamicFilters(parts: string[], filters: DynamicSearchFilters): void {
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const ids = filters.categoryIds.map((id) => `"${String(id)}"`).join(', ');
      parts.push(`categoryIds IN [${ids}]`);
    }
    if (filters.typeIds && filters.typeIds.length > 0) {
      const ids = filters.typeIds.map((id) => `"${String(id)}"`).join(', ');
      parts.push(`typeId IN [${ids}]`);
    }
    if (filters.priceRange?.min) {
      parts.push(`price >= ${filters.priceRange.min}`);
    }
    if (filters.priceRange?.max) {
      parts.push(`price <= ${filters.priceRange.max}`);
    }
    if (filters.attributeValues && filters.attributeValues.length > 0) {
      const vals = filters.attributeValues
        .map((av) => `"${String(av.attributeId)}:${av.value}"`)
        .join(', ');
      parts.push(`attributeValues IN [${vals}]`);
    }
  }

  private toItemListView(hit: DiscoveryItemHit): ItemListView {
    return {
      itemId: ItemId.raw(hit.itemId),
      typeId: TypeId.raw(hit.typeId),
      title: hit.title,
      description: hit.description || null,
      media: (hit.media ?? []).map((m) => ({ type: m.type, mediaId: MediaId.raw(m.mediaId) })) as import('@/kernel/domain/vo/media-item.js').MediaItem[],
      hasVideo: (hit.media ?? []).some((m) => m.type === 'video'),
      price:
        hit.paymentStrategies.length > 0
          ? {
              options: hit.paymentStrategies.map((s) => ({
                name: '',
                description: null,
                strategy: s as PaymentStrategy,
                price: hit.price,
              })),
            }
          : null,
      rating: hit.rating,
      reviewCount: hit.reviewCount,
      owner: hit.ownerName
        ? {
            name: hit.ownerName,
            avatarId: hit.ownerAvatarId ? MediaId.raw(hit.ownerAvatarId) : null,
          }
        : null,
      location: hit.cityId ? { cityId: hit.cityId, address: hit.address || null } : null,
      categoryIds: hit.categoryIds.map((id) => CategoryId.raw(id)),
    };
  }
}

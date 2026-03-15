import { Inject, Injectable } from '@nestjs/common';

import { MeilisearchSyncPort } from '../../application/sync-ports.js';
import type { ItemReadModel } from '../../domain/read-models/item.read-model.js';
import { DISCOVERY_ITEMS_INDEX, DiscoveryItemsSearchClient } from './discovery-items.index.js';
import type { ItemId } from '@/kernel/domain/ids.js';

type DiscoveryItemDocument = {
  itemId: string;
  typeId: string;
  title: string;
  description: string;
  ownerName: string;
  address: string;
  cityId: string | null;
  ageGroup: string | null;
  categoryIds: string[];
  price: number | null;
  attributeValues: string[];
  media: { type: string; mediaId: string }[];
  paymentStrategy: string | null;
  rating: number | null;
  reviewCount: number;
  ownerAvatarId: string | null;
  publishedAt: number;
};

function toDocument(item: ItemReadModel): DiscoveryItemDocument {
  return {
    itemId: String(item.itemId),
    typeId: String(item.typeId),
    title: item.baseInfo?.title ?? '',
    description: item.baseInfo?.description ?? '',
    ownerName: item.owner?.name ?? '',
    address: item.location?.address ?? '',
    cityId: item.location?.cityId ?? null,
    ageGroup: item.ageGroup ?? null,
    categoryIds: item.category?.categoryIds.map(String) ?? [],
    price: item.payment?.price ?? null,
    attributeValues:
      item.category?.attributeValues.map((av) => `${String(av.attributeId)}:${av.value}`) ?? [],
    media: item.baseInfo?.media.map((m) => ({ type: m.type, mediaId: String(m.mediaId) })) ?? [],
    paymentStrategy: item.payment?.strategy ?? null,
    rating: item.itemReview?.rating ?? null,
    reviewCount: item.itemReview?.reviewCount ?? 0,
    ownerAvatarId: item.owner?.avatarId ? String(item.owner.avatarId) : null,
    publishedAt: Math.floor(item.publishedAt.getTime() / 1000),
  };
}

@Injectable()
export class MeilisearchSyncAdapter implements MeilisearchSyncPort {
  public constructor(
    @Inject(DiscoveryItemsSearchClient)
    private readonly searchClient: InstanceType<typeof DiscoveryItemsSearchClient>,
  ) {}

  public async upsertItem(item: ItemReadModel): Promise<void> {
    const doc = toDocument(item);
    await this.searchClient.addDocument(DISCOVERY_ITEMS_INDEX, doc.itemId, doc);
  }

  public async deleteItem(itemId: ItemId): Promise<void> {
    await this.searchClient.deleteDoc(DISCOVERY_ITEMS_INDEX, String(itemId));
  }

  public async upsertItems(items: ItemReadModel[]): Promise<void> {
    if (items.length === 0) return;
    const docs = items.map((item) => {
      const doc = toDocument(item);
      return { id: doc.itemId, document: doc };
    });
    await this.searchClient.bulkIndex(DISCOVERY_ITEMS_INDEX, docs);
  }
}

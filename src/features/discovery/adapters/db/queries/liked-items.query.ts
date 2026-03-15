import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { LikedItemsQueryPort } from '../../../application/ports.js';
import type { LikedItemView } from '../../../domain/read-models/liked-item-view.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryItemCategories, discoveryItems, discoveryUserLikes } from '../schema.js';
import { decodeCursor, encodeCursor } from '@/infra/lib/pagination/index.js';
import type { UserId } from '@/kernel/domain/ids.js';
import { CategoryId, MediaId, ItemId, TypeId } from '@/kernel/domain/ids.js';
import type { PaymentStrategy } from '@/kernel/domain/vo/widget.js';

@Injectable()
export class DrizzleLikedItemsQuery implements LikedItemsQueryPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findLikedItems(params: {
    userId: UserId;
    search?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: LikedItemView[]; nextCursor: string | null }> {
    const userId: string = params.userId as string;
    const conditions: SQL[] = [sql`${discoveryUserLikes.userId} = ${userId}::text`];

    if (params.search) {
      conditions.push(sql`${discoveryItems.title} ILIKE ${`%${params.search}%`}`);
    }

    if (params.cursor) {
      const parsed = decodeCursor<{ likedAt: string; itemId: string }>(params.cursor);
      conditions.push(
        sql`(${discoveryUserLikes.likedAt}, ${discoveryItems.id}) < (${parsed.likedAt}, ${parsed.itemId})`,
      );
    }

    const rows = await this.dbClient.db
      .select({
        itemId: discoveryItems.id,
        typeId: discoveryItems.typeId,
        title: discoveryItems.title,
        description: discoveryItems.description,
        media: discoveryItems.media,
        paymentStrategy: discoveryItems.paymentStrategy,
        price: discoveryItems.price,
        itemRating: discoveryItems.itemRating,
        itemReviewCount: discoveryItems.itemReviewCount,
        ownerName: discoveryItems.ownerName,
        ownerAvatarId: discoveryItems.ownerAvatarId,
        cityId: discoveryItems.cityId,
        address: discoveryItems.address,
        likedAt: discoveryUserLikes.likedAt,
      })
      .from(discoveryUserLikes)
      .innerJoin(discoveryItems, eq(discoveryUserLikes.itemId, discoveryItems.id))
      .where(and(...conditions))
      .orderBy(desc(discoveryUserLikes.likedAt), asc(discoveryItems.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const resultRows = hasMore ? rows.slice(0, params.limit) : rows;

    // Batch-load categories for all result items
    const itemIds = resultRows.map((r) => r.itemId);
    const categoryRows =
      itemIds.length > 0
        ? await this.dbClient.db
            .select()
            .from(discoveryItemCategories)
            .where(inArray(discoveryItemCategories.itemId, itemIds))
        : [];

    const catsByItem = new Map<string, string[]>();
    for (const cat of categoryRows) {
      const arr = catsByItem.get(cat.itemId);
      if (arr) {
        arr.push(cat.categoryId);
      } else {
        catsByItem.set(cat.itemId, [cat.categoryId]);
      }
    }

    const items = resultRows.map((row) => this.toView(row, catsByItem.get(row.itemId) ?? []));
    const lastRow = resultRows.at(-1);
    const nextCursor =
      hasMore && lastRow
        ? encodeCursor({ likedAt: lastRow.likedAt.toISOString(), itemId: lastRow.itemId })
        : null;

    return { items, nextCursor };
  }

  private toView(
    row: {
      itemId: string;
      typeId: string;
      title: string | null;
      description: string | null;
      media: { type: string; mediaId: string }[];
      paymentStrategy: string | null;
      price: string | null;
      itemRating: string | null;
      itemReviewCount: number;
      ownerName: string | null;
      ownerAvatarId: string | null;
      cityId: string | null;
      address: string | null;
      likedAt: Date;
    },
    categoryIds: string[],
  ): LikedItemView {
    return {
      itemId: ItemId.raw(row.itemId),
      typeId: TypeId.raw(row.typeId),
      title: row.title ?? '',
      description: row.description,
      media: (row.media ?? []).map((m) => ({ type: m.type, mediaId: MediaId.raw(m.mediaId) })) as import('@/kernel/domain/vo/media-item.js').MediaItem[],
      hasVideo: (row.media ?? []).some((m) => m.type === 'video'),
      price:
        row.paymentStrategy !== null
          ? {
              strategy: row.paymentStrategy as PaymentStrategy,
              price: row.price !== null ? Number(row.price) : null,
            }
          : null,
      rating: row.itemRating !== null ? Number(row.itemRating) : null,
      reviewCount: row.itemReviewCount,
      owner: row.ownerName
        ? {
            name: row.ownerName,
            avatarId: row.ownerAvatarId ? MediaId.raw(row.ownerAvatarId) : null,
          }
        : null,
      location: row.cityId ? { cityId: row.cityId, address: row.address } : null,
      categoryIds: categoryIds.map((id) => CategoryId.raw(id)),
      likedAt: row.likedAt,
    };
  }
}

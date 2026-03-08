import { Injectable } from '@nestjs/common';
import { and, desc, eq, asc, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { LikedItemsQueryPort } from '../../../application/ports.js';
import type { LikedItemView } from '../../../domain/read-models/liked-item-view.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryItems, discoveryUserLikes } from '../schema.js';
import { ItemId, TypeId, CategoryId, FileId } from '@/kernel/domain/ids.js';
import type { UserId } from '@/kernel/domain/ids.js';
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
    const conditions: SQL[] = [eq(discoveryUserLikes.userId, String(params.userId))];

    if (params.search) {
      conditions.push(sql`${discoveryItems.title} ILIKE ${'%' + params.search + '%'}`);
    }

    if (params.cursor) {
      const parsed = this.decodeCursor(params.cursor);
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
        imageId: discoveryItems.imageId,
        paymentStrategy: discoveryItems.paymentStrategy,
        price: discoveryItems.price,
        itemRating: discoveryItems.itemRating,
        itemReviewCount: discoveryItems.itemReviewCount,
        ownerName: discoveryItems.ownerName,
        ownerAvatarId: discoveryItems.ownerAvatarId,
        cityId: discoveryItems.cityId,
        address: discoveryItems.address,
        categoryIds: discoveryItems.categoryIds,
        likedAt: discoveryUserLikes.likedAt,
      })
      .from(discoveryUserLikes)
      .innerJoin(discoveryItems, eq(discoveryUserLikes.itemId, discoveryItems.id))
      .where(and(...conditions))
      .orderBy(desc(discoveryUserLikes.likedAt), asc(discoveryItems.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const resultRows = hasMore ? rows.slice(0, params.limit) : rows;

    const items = resultRows.map((row) => this.toView(row));
    const nextCursor = hasMore
      ? this.encodeCursor(resultRows[resultRows.length - 1]!)
      : null;

    return { items, nextCursor };
  }

  private toView(row: {
    itemId: string;
    typeId: string;
    title: string | null;
    description: string | null;
    imageId: string | null;
    paymentStrategy: string | null;
    price: string | null;
    itemRating: string | null;
    itemReviewCount: number;
    ownerName: string | null;
    ownerAvatarId: string | null;
    cityId: string | null;
    address: string | null;
    categoryIds: string[];
    likedAt: Date;
  }): LikedItemView {
    return {
      itemId: ItemId.raw(row.itemId),
      typeId: TypeId.raw(row.typeId),
      title: row.title ?? '',
      description: row.description,
      imageId: row.imageId ? FileId.raw(row.imageId) : null,
      price:
        row.paymentStrategy != null
          ? {
              strategy: row.paymentStrategy as PaymentStrategy,
              price: row.price != null ? Number(row.price) : null,
            }
          : null,
      rating: row.itemRating != null ? Number(row.itemRating) : null,
      reviewCount: row.itemReviewCount,
      owner: row.ownerName
        ? { name: row.ownerName, avatarId: row.ownerAvatarId ? FileId.raw(row.ownerAvatarId) : null }
        : null,
      location: row.cityId ? { cityId: row.cityId, address: row.address } : null,
      categoryIds: row.categoryIds.map((id) => CategoryId.raw(id)),
      likedAt: row.likedAt,
    };
  }

  private encodeCursor(row: { itemId: string; likedAt: Date }): string {
    return Buffer.from(
      JSON.stringify({ likedAt: row.likedAt.toISOString(), itemId: row.itemId }),
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): { likedAt: string; itemId: string } {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as {
      likedAt: string;
      itemId: string;
    };
  }
}

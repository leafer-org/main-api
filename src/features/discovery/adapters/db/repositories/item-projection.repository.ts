import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { ItemProjectionPort } from '../../../application/projection-ports.js';
import type { ItemReadModel } from '../../../domain/read-models/item.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryItems } from '../schema.js';
import type { FileId, ItemId, OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleItemProjectionRepository implements ItemProjectionPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async upsert(item: ItemReadModel): Promise<void> {
    await this.dbClient.db
      .insert(discoveryItems)
      .values({
        id: item.itemId as string,
        typeId: item.typeId as string,
        title: item.baseInfo?.title ?? null,
        description: item.baseInfo?.description ?? null,
        imageId: item.baseInfo?.imageId as string | null,
        ageGroup: item.ageGroup ?? null,
        cityId: item.location?.cityId ?? null,
        lat: item.location?.coordinates.lat ?? null,
        lng: item.location?.coordinates.lng ?? null,
        address: item.location?.address ?? null,
        paymentStrategy: item.payment?.strategy ?? null,
        price: item.payment?.price != null ? String(item.payment.price) : null,
        categoryIds: (item.category?.categoryIds as string[]) ?? [],
        attributeValues: item.category?.attributeValues.map((a) => ({
          attributeId: a.attributeId as string,
          value: a.value,
        })) ?? [],
        organizationId: item.owner?.organizationId as string | null,
        ownerName: item.owner?.name ?? null,
        ownerAvatarId: item.owner?.avatarId as string | null,
        itemRating: item.itemReview?.rating != null ? String(item.itemReview.rating) : null,
        itemReviewCount: item.itemReview?.reviewCount ?? 0,
        ownerRating: item.ownerReview?.rating != null ? String(item.ownerReview.rating) : null,
        ownerReviewCount: item.ownerReview?.reviewCount ?? 0,
        eventDates: item.eventDateTime?.dates.map((d) => d.toISOString()) ?? null,
        scheduleEntries: item.schedule?.entries ?? null,
        publishedAt: item.publishedAt,
        updatedAt: item.updatedAt,
      })
      .onConflictDoUpdate({
        target: discoveryItems.id,
        set: {
          typeId: item.typeId as string,
          title: item.baseInfo?.title ?? null,
          description: item.baseInfo?.description ?? null,
          imageId: item.baseInfo?.imageId as string | null,
          ageGroup: item.ageGroup ?? null,
          cityId: item.location?.cityId ?? null,
          lat: item.location?.coordinates.lat ?? null,
          lng: item.location?.coordinates.lng ?? null,
          address: item.location?.address ?? null,
          paymentStrategy: item.payment?.strategy ?? null,
          price: item.payment?.price != null ? String(item.payment.price) : null,
          categoryIds: (item.category?.categoryIds as string[]) ?? [],
          attributeValues: item.category?.attributeValues.map((a) => ({
            attributeId: a.attributeId as string,
            value: a.value,
          })) ?? [],
          organizationId: item.owner?.organizationId as string | null,
          ownerName: item.owner?.name ?? null,
          ownerAvatarId: item.owner?.avatarId as string | null,
          itemRating: item.itemReview?.rating != null ? String(item.itemReview.rating) : null,
          itemReviewCount: item.itemReview?.reviewCount ?? 0,
          ownerRating: item.ownerReview?.rating != null ? String(item.ownerReview.rating) : null,
          ownerReviewCount: item.ownerReview?.reviewCount ?? 0,
          eventDates: item.eventDateTime?.dates.map((d) => d.toISOString()) ?? null,
          scheduleEntries: item.schedule?.entries ?? null,
          updatedAt: item.updatedAt,
        },
      });
  }

  public async delete(itemId: ItemId): Promise<void> {
    await this.dbClient.db.delete(discoveryItems).where(eq(discoveryItems.id, itemId as string));
  }

  public async deleteByOrganizationId(organizationId: OrganizationId): Promise<ItemId[]> {
    const rows = await this.dbClient.db
      .delete(discoveryItems)
      .where(eq(discoveryItems.organizationId, organizationId as string))
      .returning({ id: discoveryItems.id });

    return rows.map((r) => r.id as ItemId);
  }

  public async updateOwnerData(
    organizationId: OrganizationId,
    data: { name: string; avatarId: FileId | null },
  ): Promise<ItemId[]> {
    const rows = await this.dbClient.db
      .update(discoveryItems)
      .set({
        ownerName: data.name,
        ownerAvatarId: data.avatarId as string | null,
      })
      .where(eq(discoveryItems.organizationId, organizationId as string))
      .returning({ id: discoveryItems.id });

    return rows.map((r) => r.id as ItemId);
  }

  public async updateItemReview(
    itemId: ItemId,
    rating: number | null,
    reviewCount: number,
  ): Promise<void> {
    await this.dbClient.db
      .update(discoveryItems)
      .set({
        itemRating: rating != null ? String(rating) : null,
        itemReviewCount: reviewCount,
      })
      .where(eq(discoveryItems.id, itemId as string));
  }

  public async updateOwnerReview(
    organizationId: OrganizationId,
    rating: number | null,
    reviewCount: number,
  ): Promise<void> {
    await this.dbClient.db
      .update(discoveryItems)
      .set({
        ownerRating: rating != null ? String(rating) : null,
        ownerReviewCount: reviewCount,
      })
      .where(eq(discoveryItems.organizationId, organizationId as string));
  }

}

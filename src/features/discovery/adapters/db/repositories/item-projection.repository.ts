import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { ItemProjectionPort } from '../../../application/projection-ports.js';
import type { ItemReadModel } from '../../../domain/read-models/item.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import {
  discoveryItems,
  discoveryItemCategories,
  discoveryItemAttributes,
  discoveryItemEventDates,
  discoveryItemSchedules,
} from '../schema.js';
import type { CategoryId, FileId, ItemId, OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleItemProjectionRepository implements ItemProjectionPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async upsert(item: ItemReadModel): Promise<void> {
    const itemId = item.itemId as string;

    await this.dbClient.db
      .insert(discoveryItems)
      .values({
        id: itemId,
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
        price:
          item.payment?.price !== undefined && item.payment?.price !== null
            ? String(item.payment.price)
            : null,
        organizationId: item.owner?.organizationId as string | null,
        ownerName: item.owner?.name ?? null,
        ownerAvatarId: item.owner?.avatarId as string | null,
        itemRating:
          item.itemReview?.rating !== undefined && item.itemReview?.rating !== null
            ? String(item.itemReview.rating)
            : null,
        itemReviewCount: item.itemReview?.reviewCount ?? 0,
        ownerRating:
          item.ownerReview?.rating !== undefined && item.ownerReview?.rating !== null
            ? String(item.ownerReview.rating)
            : null,
        ownerReviewCount: item.ownerReview?.reviewCount ?? 0,
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
          price:
            item.payment?.price !== undefined && item.payment?.price !== null
              ? String(item.payment.price)
              : null,
          organizationId: item.owner?.organizationId as string | null,
          ownerName: item.owner?.name ?? null,
          ownerAvatarId: item.owner?.avatarId as string | null,
          itemRating:
            item.itemReview?.rating !== undefined && item.itemReview?.rating !== null
              ? String(item.itemReview.rating)
              : null,
          itemReviewCount: item.itemReview?.reviewCount ?? 0,
          ownerRating:
            item.ownerReview?.rating !== undefined && item.ownerReview?.rating !== null
              ? String(item.ownerReview.rating)
              : null,
          ownerReviewCount: item.ownerReview?.reviewCount ?? 0,
          updatedAt: item.updatedAt,
        },
      });

    await this.syncJunctionTables(itemId, item);
  }

  public async delete(itemId: ItemId): Promise<void> {
    const id = itemId as string;
    await this.deleteJunctionRows([id]);
    await this.dbClient.db.delete(discoveryItems).where(eq(discoveryItems.id, id));
  }

  public async deleteByOrganizationId(organizationId: OrganizationId): Promise<ItemId[]> {
    const rows = await this.dbClient.db
      .delete(discoveryItems)
      .where(eq(discoveryItems.organizationId, organizationId as string))
      .returning({ id: discoveryItems.id });

    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await this.deleteJunctionRows(ids);
    }

    return ids.map((id) => id as ItemId);
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
        itemRating: rating !== null ? String(rating) : null,
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
        ownerRating: rating !== null ? String(rating) : null,
        ownerReviewCount: reviewCount,
      })
      .where(eq(discoveryItems.organizationId, organizationId as string));
  }

  public async findItemIdsByCategoryId(categoryId: CategoryId): Promise<ItemId[]> {
    const rows = await this.dbClient.db
      .select({ itemId: discoveryItemCategories.itemId })
      .from(discoveryItemCategories)
      .where(eq(discoveryItemCategories.categoryId, categoryId as string));

    return rows.map((r) => r.itemId as ItemId);
  }

  private async syncJunctionTables(itemId: string, item: ItemReadModel): Promise<void> {
    // Delete old junction rows
    await this.deleteJunctionRows([itemId]);

    // Insert categories
    const categoryIds = (item.category?.categoryIds as string[]) ?? [];
    if (categoryIds.length > 0) {
      await this.dbClient.db.insert(discoveryItemCategories).values(
        categoryIds.map((categoryId) => ({ itemId, categoryId })),
      );
    }

    // Insert attribute values
    const attributeValues = item.category?.attributeValues ?? [];
    if (attributeValues.length > 0) {
      await this.dbClient.db.insert(discoveryItemAttributes).values(
        attributeValues.map((av) => ({
          itemId,
          attributeId: av.attributeId as string,
          value: av.value,
        })),
      );
    }

    // Insert event dates
    const eventDates = item.eventDateTime?.dates ?? [];
    if (eventDates.length > 0) {
      await this.dbClient.db.insert(discoveryItemEventDates).values(
        eventDates.map((d) => ({ itemId, eventDate: d })),
      );
    }

    // Insert schedule entries
    const scheduleEntries = item.schedule?.entries ?? [];
    if (scheduleEntries.length > 0) {
      await this.dbClient.db.insert(discoveryItemSchedules).values(
        scheduleEntries.map((e) => ({
          itemId,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
        })),
      );
    }
  }

  private async deleteJunctionRows(itemIds: string[]): Promise<void> {
    const condition = <T extends { itemId: unknown }>(table: T) =>
      itemIds.length === 1
        ? eq(table.itemId as typeof discoveryItemCategories.itemId, itemIds[0] as string)
        : inArray(table.itemId as typeof discoveryItemCategories.itemId, itemIds);

    await Promise.all([
      this.dbClient.db.delete(discoveryItemCategories).where(condition(discoveryItemCategories)),
      this.dbClient.db.delete(discoveryItemAttributes).where(condition(discoveryItemAttributes)),
      this.dbClient.db.delete(discoveryItemEventDates).where(condition(discoveryItemEventDates)),
      this.dbClient.db.delete(discoveryItemSchedules).where(condition(discoveryItemSchedules)),
    ]);
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CategoryAncestorLookupPort } from '../../application/ports.js';
import { GorseSyncPort } from '../../application/sync-ports.js';
import { type ItemReadModel, toGorseLabels } from '../../domain/read-models/item.read-model.js';
import { itemGeoCategories, itemGlobalCategories } from '@/infra/lib/geo/h3-geo.js';
import type { GorseItemPayload } from '@/infra/lib/nest-gorse/index.js';
import { GorseClient } from '@/infra/lib/nest-gorse/index.js';
import { CityCoordinatesPort } from '@/kernel/application/ports/city-coordinates.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class GorseSyncAdapter implements GorseSyncPort {
  private readonly logger = new Logger(GorseSyncAdapter.name);

  public constructor(
    @Inject(GorseClient) private readonly client: GorseClient,
    @Inject(CategoryAncestorLookupPort) private readonly ancestorLookup: CategoryAncestorLookupPort,
    @Inject(CityCoordinatesPort) private readonly cityCoordinates: CityCoordinatesPort,
  ) {}

  public async upsertItem(item: ItemReadModel): Promise<void> {
    const payload = await this.toGorseItem(item);
    await this.client.upsertItem(String(item.itemId), payload);
    this.logger.debug(`Upserted item ${String(item.itemId)}`);
  }

  public async deleteItem(itemId: ItemId): Promise<void> {
    await this.client.deleteItem(String(itemId));
    this.logger.debug(`Deleted item ${String(itemId)}`);
  }

  public async sendFeedback(
    userId: UserId,
    itemId: ItemId,
    feedbackType: string,
    timestamp: Date,
  ): Promise<void> {
    await this.client.insertFeedback([
      {
        FeedbackType: feedbackType,
        UserId: String(userId),
        ItemId: String(itemId),
        Timestamp: timestamp.toISOString(),
      },
    ]);
    this.logger.debug(
      `Sent feedback ${feedbackType} for user ${String(userId)} item ${String(itemId)}`,
    );
  }

  public async deleteFeedback(userId: UserId, itemId: ItemId, feedbackType: string): Promise<void> {
    await this.client.deleteFeedback(feedbackType, String(userId), String(itemId));
    this.logger.debug(
      `Deleted feedback ${feedbackType} for user ${String(userId)} item ${String(itemId)}`,
    );
  }

  public async upsertUser(userId: UserId, labels: string[], comment: string): Promise<void> {
    await this.client.upsertUser(String(userId), {
      UserId: String(userId),
      Labels: labels,
      Comment: comment,
    });
    this.logger.debug(`Upserted user ${String(userId)}`);
  }

  public async deleteUser(userId: UserId): Promise<void> {
    await this.client.deleteUser(String(userId));
    this.logger.debug(`Deleted user ${String(userId)}`);
  }

  private async toGorseItem(item: ItemReadModel): Promise<GorseItemPayload> {
    const labels = toGorseLabels(item);

    const ageGroups = this.resolveAgeGroups(item.ageGroup);
    const categoryIds = item.category?.categoryIds ?? [];
    const rootCategoryIds =
      categoryIds.length > 0
        ? (await this.ancestorLookup.findRootCategoryIds(categoryIds)).map(String)
        : [];

    const categories = await this.resolveCategories(item, ageGroups, rootCategoryIds);

    return {
      ItemId: String(item.itemId),
      IsHidden: false,
      Labels: labels,
      Categories: categories,
      Timestamp: item.publishedAt.toISOString(),
      Comment: item.baseInfo?.title ?? '',
    };
  }

  private resolveAgeGroups(ageGroup?: string): string[] {
    if (ageGroup === 'all') return ['children', 'adults'];
    return [ageGroup ?? 'adults'];
  }

  private async resolveCategories(
    item: ItemReadModel,
    ageGroups: string[],
    rootCategoryIds: string[],
  ): Promise<string[]> {
    if (item.location?.coordinates) {
      return itemGeoCategories(
        item.location.coordinates.lat,
        item.location.coordinates.lng,
        ageGroups,
        rootCategoryIds,
      );
    }

    if (item.location?.cityId) {
      const resolved = await this.cityCoordinates.findCoordinates(item.location.cityId);
      if (resolved) {
        return itemGeoCategories(resolved.lat, resolved.lng, ageGroups, rootCategoryIds);
      }
    }

    return itemGlobalCategories(ageGroups, rootCategoryIds);
  }
}

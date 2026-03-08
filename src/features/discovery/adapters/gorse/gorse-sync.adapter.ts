import { Inject, Injectable, Logger } from '@nestjs/common';

import { CategoryAncestorLookupPort } from '../../application/ports.js';
import { GorseSyncPort } from '../../application/sync-ports.js';
import { type ItemReadModel, toGorseLabels } from '../../domain/read-models/item.read-model.js';
import type { GorseItemPayload } from '@/infra/lib/nest-gorse/index.js';
import { GorseClient } from '@/infra/lib/nest-gorse/index.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class GorseSyncAdapter implements GorseSyncPort {
  private readonly logger = new Logger(GorseSyncAdapter.name);

  public constructor(
    @Inject(GorseClient) private readonly client: GorseClient,
    @Inject(CategoryAncestorLookupPort) private readonly ancestorLookup: CategoryAncestorLookupPort,
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

  public async upsertItems(items: ItemReadModel[]): Promise<void> {
    if (items.length === 0) return;
    const payloads = await Promise.all(items.map((i) => this.toGorseItem(i)));
    await this.client.insertItems(payloads);
    this.logger.debug(`Upserted ${items.length} items`);
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

  private async toGorseItem(item: ItemReadModel): Promise<GorseItemPayload> {
    const labels = toGorseLabels(item);

    const categoryIds = item.category?.categoryIds ?? [];
    const categories = categoryIds.map(String);

    if (categoryIds.length > 0) {
      const ancestorIds = await this.ancestorLookup.findAncestorIds(categoryIds);
      for (const id of ancestorIds) {
        categories.push(String(id));
      }
    }

    return {
      ItemId: String(item.itemId),
      IsHidden: false,
      Labels: labels,
      Categories: categories,
      Timestamp: item.publishedAt.toISOString(),
      Comment: item.baseInfo?.title ?? '',
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';

import type { ItemPublishedEvent, ItemUnpublishedEvent } from '@/kernel/domain/events/item.events.js';

import { projectItemFromEvent } from '../../../domain/read-models/item.read-model.js';
import { IdempotencyPort, ItemProjectionPort } from '../../projection-ports.js';
import { GorseSyncPort, MeilisearchSyncPort } from '../../sync-ports.js';

@Injectable()
export class ProjectItemHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(ItemProjectionPort) private readonly itemProjection: ItemProjectionPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
    @Inject(MeilisearchSyncPort) private readonly meilisearch: MeilisearchSyncPort,
  ) {}

  public async handleItemPublished(eventId: string, payload: ItemPublishedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const readModel = projectItemFromEvent(payload);
    await this.itemProjection.upsert(readModel);
    await this.gorse.upsertItem(readModel);
    await this.meilisearch.upsertItem(readModel);
    await this.idempotency.markProcessed(eventId);
  }

  public async handleItemUnpublished(eventId: string, payload: ItemUnpublishedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.itemProjection.delete(payload.itemId);
    await this.gorse.deleteItem(payload.itemId);
    await this.meilisearch.deleteItem(payload.itemId);
    await this.idempotency.markProcessed(eventId);
  }
}

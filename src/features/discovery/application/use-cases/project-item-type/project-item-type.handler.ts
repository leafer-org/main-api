import { Inject, Injectable } from '@nestjs/common';

import type {
  ItemTypeCreatedEvent,
  ItemTypeUpdatedEvent,
} from '@/kernel/domain/events/item-type.events.js';

import { projectItemType } from '../../../domain/read-models/item-type.read-model.js';
import { IdempotencyPort, ItemTypeProjectionPort } from '../../projection-ports.js';

@Injectable()
export class ProjectItemTypeHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(ItemTypeProjectionPort) private readonly itemTypeProjection: ItemTypeProjectionPort,
  ) {}

  public async handleItemTypeCreated(
    eventId: string,
    payload: ItemTypeCreatedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const itemType = projectItemType(payload);
    await this.itemTypeProjection.upsert(itemType);
    await this.idempotency.markProcessed(eventId);
  }

  public async handleItemTypeUpdated(
    eventId: string,
    payload: ItemTypeUpdatedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const itemType = projectItemType(payload);
    await this.itemTypeProjection.upsert(itemType);
    await this.idempotency.markProcessed(eventId);
  }
}

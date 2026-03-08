import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { ItemEventPublisher, ItemRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId } from '@/kernel/domain/ids.js';

@Injectable()
export class ApproveItemModerationHandler {
  public constructor(
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(ItemEventPublisher) private readonly eventPublisher: ItemEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async handle(event: { itemId: ItemId }): Promise<void> {
    const now = this.clock.now();
    const eventId = crypto.randomUUID();

    await this.txHost.startTransaction(async (tx) => {
      const item = await this.itemRepository.findById(tx, event.itemId);
      if (!item) return;

      const result = ItemEntity.approveModeration(item, {
        type: 'ApproveItemModeration',
        eventId,
        now,
      });
      if (isLeft(result)) return;

      const { state: newState, event: domainEvent } = result.value;
      await this.itemRepository.save(tx, newState);

      await this.eventPublisher.publishItemPublished(tx, {
        id: eventId,
        type: 'item.published',
        itemId: domainEvent.itemId,
        typeId: domainEvent.typeId,
        organizationId: domainEvent.organizationId,
        widgets: domainEvent.widgets,
        republished: domainEvent.republished,
        publishedAt: domainEvent.publishedAt,
      });
    });
  }
}

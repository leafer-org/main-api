import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { ItemEventPublisher, ItemRepository, OrganizationRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class UnpublishExcessItemsHandler {
  public constructor(
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(ItemEventPublisher) private readonly eventPublisher: ItemEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async handle(event: { organizationId: OrganizationId }): Promise<void> {
    const now = this.clock.now();

    await this.txHost.startTransaction(async (tx) => {
      const org = await this.organizationRepository.findById(tx, event.organizationId);
      if (!org) return;

      const publishedItems = await this.itemRepository.findPublishedByOrganizationId(
        tx,
        event.organizationId,
      );

      const excess = publishedItems.length - org.subscription.maxPublishedItems;
      if (excess <= 0) return;

      // Unpublish the most recently published items first
      const sorted = [...publishedItems].sort((a, b) => {
        const aDate = a.publication?.publishedAt.getTime() ?? 0;
        const bDate = b.publication?.publishedAt.getTime() ?? 0;
        return bDate - aDate;
      });

      const toUnpublish = sorted.slice(0, excess);

      for (const item of toUnpublish) {
        const eventId = crypto.randomUUID();
        const result = ItemEntity.unpublish(item, {
          type: 'UnpublishItem',
          eventId,
          now,
        });
        if (isLeft(result)) continue;

        await this.itemRepository.save(tx, result.value.state);
        await this.eventPublisher.publishItemUnpublished(tx, {
          id: eventId,
          type: 'item.unpublished',
          itemId: result.value.event.itemId,
          unpublishedAt: result.value.event.unpublishedAt,
        });
      }
    });
  }
}

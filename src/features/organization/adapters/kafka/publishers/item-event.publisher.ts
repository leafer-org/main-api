import { Inject, Injectable } from '@nestjs/common';

import { ItemEventPublisher } from '../../../application/ports.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import { itemModerationContract } from '@/infra/kafka-contracts/item-moderation.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  ItemModerationRequestedEvent,
  ItemPublishedEvent,
  ItemUnpublishedEvent,
} from '@/kernel/domain/events/item.events.js';

@Injectable()
export class OutboxItemEventPublisher extends ItemEventPublisher {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    super();
  }

  public async publishItemPublished(tx: Transaction, event: ItemPublishedEvent): Promise<void> {
    const db = this.txHost.get(tx);
    // biome-ignore lint/suspicious/noExplicitAny: ItemWidget[] structurally matches WidgetSchema union but TypeBox types are not assignable
    const widgets = event.widgets as any;
    await this.outbox.enqueue(
      db,
      itemStreamingContract,
      {
        id: event.id,
        type: 'item.published',
        itemId: event.itemId as string,
        typeId: event.typeId as string,
        organizationId: event.organizationId as string,
        widgets,
        republished: event.republished,
        publishedAt: event.publishedAt.toISOString(),
      },
      { key: event.itemId as string },
    );
  }

  public async publishItemUnpublished(tx: Transaction, event: ItemUnpublishedEvent): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      itemStreamingContract,
      {
        id: event.id,
        type: 'item.unpublished',
        itemId: event.itemId as string,
        unpublishedAt: event.unpublishedAt.toISOString(),
      },
      { key: event.itemId as string },
    );
  }

  public async publishModerationRequested(
    tx: Transaction,
    event: ItemModerationRequestedEvent,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      itemModerationContract,
      {
        id: event.id,
        type: 'item.moderation-requested',
        itemId: event.itemId as string,
        organizationId: event.organizationId as string,
        typeId: event.typeId as string,
        widgets: event.widgets as unknown[],
        submittedAt: event.submittedAt.toISOString(),
      },
      { key: event.itemId as string },
    );
  }
}

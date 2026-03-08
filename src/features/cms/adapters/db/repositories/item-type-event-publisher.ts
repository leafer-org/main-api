import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';

import { ItemTypeEventPublisher } from '../../../application/ports.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { itemTypeStreamingContract } from '@/infra/kafka-contracts/item-type.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  ItemTypeCreatedEvent,
  ItemTypeUpdatedEvent,
} from '@/kernel/domain/events/item-type.events.js';

@Injectable()
export class OutboxItemTypeEventPublisher implements ItemTypeEventPublisher {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  public async publishItemTypeCreated(tx: Transaction, event: ItemTypeCreatedEvent): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      itemTypeStreamingContract,
      {
        id: uuidv7(),
        type: 'item-type.created' as const,
        typeId: event.typeId as string,
        name: event.name,
        availableWidgetTypes: event.availableWidgetTypes as string[],
        requiredWidgetTypes: event.requiredWidgetTypes as string[],
        createdAt: event.createdAt.toISOString(),
      },
      { key: event.typeId as string },
    );
  }

  public async publishItemTypeUpdated(tx: Transaction, event: ItemTypeUpdatedEvent): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      itemTypeStreamingContract,
      {
        id: uuidv7(),
        type: 'item-type.updated' as const,
        typeId: event.typeId as string,
        name: event.name,
        availableWidgetTypes: event.availableWidgetTypes as string[],
        requiredWidgetTypes: event.requiredWidgetTypes as string[],
        updatedAt: event.updatedAt.toISOString(),
      },
      { key: event.typeId as string },
    );
  }
}

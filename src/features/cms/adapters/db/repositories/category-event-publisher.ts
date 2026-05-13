import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';

import { CategoryEventPublisher } from '../../../application/ports.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { categoryStreamingContract } from '@/infra/kafka-contracts/category.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';

@Injectable()
export class OutboxCategoryEventPublisher implements CategoryEventPublisher {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  public async publishCategoryPublished(
    tx: Transaction,
    event: CategoryPublishedEvent,
  ): Promise<void> {
    await this.publishChanged(tx, event.categoryId as string, event.publishedAt);
  }

  public async publishCategoryUnpublished(
    tx: Transaction,
    event: CategoryUnpublishedEvent,
  ): Promise<void> {
    await this.publishChanged(tx, event.categoryId as string, event.unpublishedAt);
  }

  private async publishChanged(
    tx: Transaction,
    categoryId: string,
    changedAt: Date,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      categoryStreamingContract,
      {
        id: uuidv7(),
        type: 'category.changed',
        categoryId,
        changedAt: changedAt.toISOString(),
      },
      { key: categoryId },
    );
  }
}

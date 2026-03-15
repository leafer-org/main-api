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
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      categoryStreamingContract,
      {
        id: uuidv7(),
        type: 'category.published' as const,
        categoryId: event.categoryId as string,
        parentCategoryId: event.parentCategoryId as string | null,
        name: event.name,
        iconId: event.iconId as string,
        allowedTypeIds: event.allowedTypeIds as string[],
        ageGroups: event.ageGroups as string[],
        ancestorIds: event.ancestorIds as string[],
        attributes: event.attributes.map((a) => ({
          attributeId: a.attributeId as string,
          name: a.name,
          required: a.required,
          schema: a.schema,
        })),
        republished: event.republished,
        publishedAt: event.publishedAt.toISOString(),
      },
      { key: event.categoryId as string },
    );
  }

  public async publishCategoryUnpublished(
    tx: Transaction,
    event: CategoryUnpublishedEvent,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      categoryStreamingContract,
      {
        id: uuidv7(),
        type: 'category.unpublished' as const,
        categoryId: event.categoryId as string,
        unpublishedAt: event.unpublishedAt.toISOString(),
      },
      { key: event.categoryId as string },
    );
  }
}

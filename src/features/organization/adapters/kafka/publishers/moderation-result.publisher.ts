import { Inject, Injectable } from '@nestjs/common';

import { ModerationResultPublisher, type ModerationResultEvent } from '../../../application/ports.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { moderationResultsContract } from '@/infra/kafka-contracts/moderation-results.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';

@Injectable()
export class OutboxModerationResultPublisher extends ModerationResultPublisher {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    super();
  }

  public async publish(tx: Transaction, event: ModerationResultEvent): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      moderationResultsContract,
      {
        id: event.id,
        type: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
      },
      { key: event.entityId },
    );
  }
}

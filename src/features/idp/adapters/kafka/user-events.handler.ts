import { Inject, Injectable } from '@nestjs/common';

import { UserEventPublisher } from '../../application/ports.js';
import type { UserEvent } from '../../domain/aggregates/user/events.js';
import { type UserEventMessage, userEventsContract } from './topics.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class OutboxUserEventPublisher implements UserEventPublisher {
  public constructor(
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(TransactionHostPg) private readonly txHost: TransactionHostPg,
  ) {}

  public async publish(tx: Transaction, userId: UserId, event: UserEvent): Promise<void> {
    const drizzleTx = this.txHost.get(tx);
    const message = this.toMessage(userId, event);
    await this.outbox.enqueue(drizzleTx, userEventsContract, message, { key: userId });
  }

  private toMessage(userId: UserId, event: UserEvent): UserEventMessage {
    switch (event.type) {
      case 'user.created':
        return {
          type: 'user.created',
          userId: event.id as string,
          phoneNumber: event.phoneNumber as string,
          fullName: event.fullName as string,
          role: event.role as string,
          createdAt: event.createdAt.toISOString(),
        };
      case 'user.profile_updated':
        return {
          type: 'user.profile_updated',
          userId: userId as string,
          fullName: event.fullName as string,
          updatedAt: event.updatedAt.toISOString(),
        };
      case 'user.role_updated':
        return {
          type: 'user.role_updated',
          userId: event.userId as string,
          role: event.role as string,
          updatedAt: event.updatedAt.toISOString(),
        };
      default:
        assertNever(event);
    }
  }
}

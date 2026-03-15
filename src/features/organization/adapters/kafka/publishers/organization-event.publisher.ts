import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEventPublisher } from '../../../application/ports.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { organizationStreamingContract } from '@/infra/kafka-contracts/organization.contract.js';
import { organizationModerationContract } from '@/infra/kafka-contracts/organization-moderation.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  OrganizationModerationRequestedEvent,
  OrganizationPublishedEvent,
  OrganizationUnpublishedEvent,
} from '@/kernel/domain/events/organization.events.js';

@Injectable()
export class OutboxOrganizationEventPublisher extends OrganizationEventPublisher {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    super();
  }

  public async publishOrganizationPublished(
    tx: Transaction,
    event: OrganizationPublishedEvent,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      organizationStreamingContract,
      {
        id: event.id,
        type: 'organization.published',
        organizationId: event.organizationId as string,
        name: event.name,
        avatarId: event.avatarId as string | null,
        media: event.media.map((m) => ({ type: m.type, mediaId: m.mediaId as string })),
        republished: event.republished,
        publishedAt: event.publishedAt.toISOString(),
      },
      { key: event.organizationId as string },
    );
  }

  public async publishOrganizationUnpublished(
    tx: Transaction,
    event: OrganizationUnpublishedEvent,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      organizationStreamingContract,
      {
        id: event.id,
        type: 'organization.unpublished',
        organizationId: event.organizationId as string,
        unpublishedAt: event.unpublishedAt.toISOString(),
      },
      { key: event.organizationId as string },
    );
  }

  public async publishModerationRequested(
    tx: Transaction,
    event: OrganizationModerationRequestedEvent,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      organizationModerationContract,
      {
        id: event.id,
        type: 'organization.moderation-requested',
        organizationId: event.organizationId as string,
        name: event.name,
        description: event.description,
        avatarId: event.avatarId as string | null,
        media: event.media.map((m) => ({ type: m.type, mediaId: m.mediaId as string })),
        submittedAt: event.submittedAt.toISOString(),
      },
      { key: event.organizationId as string },
    );
  }
}

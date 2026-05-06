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
  OrganizationRespondabilityChangedEvent,
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
        description: event.description,
        avatarId: event.avatarId as string | null,
        media: event.media.map((m) => ({ type: m.type, mediaId: m.mediaId as string })),
        contacts: event.contacts.map((c) => ({ type: c.type, value: c.value, label: c.label })),
        team: event.team
          ? {
              title: event.team.title,
              members: event.team.members.map((m) => ({
                name: m.name,
                description: m.description,
                media: m.media.map((mm) => ({ type: mm.type, mediaId: mm.mediaId as string })),
                employeeUserId: m.employeeUserId,
              })),
            }
          : null,
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

  public async publishRespondabilityChanged(
    tx: Transaction,
    event: OrganizationRespondabilityChangedEvent,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      organizationStreamingContract,
      {
        id: event.id,
        type: 'organization.respondability-changed',
        organizationId: event.organizationId as string,
        userId: event.userId as string,
        changedAt: event.changedAt.toISOString(),
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

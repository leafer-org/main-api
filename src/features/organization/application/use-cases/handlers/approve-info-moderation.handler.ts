import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationEventPublisher, OrganizationRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class ApproveInfoModerationHandler {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(OrganizationEventPublisher) private readonly eventPublisher: OrganizationEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async handle(event: { organizationId: OrganizationId }): Promise<void> {
    const now = this.clock.now();
    const eventId = crypto.randomUUID();

    await this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, event.organizationId);
      if (!state) return;

      const result = OrganizationEntity.approveInfoModeration(state, {
        type: 'ApproveInfoModeration',
        eventId,
        now,
      });
      if (isLeft(result)) return;

      const { state: newState, event: domainEvent } = result.value;
      await this.organizationRepository.save(tx, newState);

      const republished = state.infoPublication !== null;
      await this.eventPublisher.publishOrganizationPublished(tx, {
        id: eventId,
        type: 'organization.published',
        organizationId: state.id,
        name: domainEvent.name,
        avatarId: domainEvent.avatarId,
        republished,
        publishedAt: domainEvent.publishedAt,
      });
    });
  }
}

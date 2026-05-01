import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { ModerationResultPublisher, OrganizationEventPublisher, OrganizationRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class ApproveInfoModerationInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(OrganizationEventPublisher) private readonly eventPublisher: OrganizationEventPublisher,
    @Inject(ModerationResultPublisher) private readonly moderationResultPublisher: ModerationResultPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { organizationId: OrganizationId }) {
    const auth = await this.permissionCheck.mustCan(Permission.OrganizationInfoModerate);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();
    const eventId = crypto.randomUUID();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, command.organizationId);
      if (!state) return Left(new OrganizationNotFoundError());

      const result = OrganizationEntity.approveInfoModeration(state, {
        type: 'ApproveInfoModeration',
        eventId,
        now,
      });
      if (isLeft(result)) return result;

      const { state: newState, event: domainEvent } = result.value;
      await this.organizationRepository.save(tx, newState);

      const republished = state.infoPublication !== null;
      await this.eventPublisher.publishOrganizationPublished(tx, {
        id: eventId,
        type: 'organization.published',
        organizationId: state.id,
        name: domainEvent.name,
        avatarId: domainEvent.avatarId,
        media: domainEvent.media,
        republished,
        publishedAt: domainEvent.publishedAt,
      });

      await this.moderationResultPublisher.publish(tx, {
        id: crypto.randomUUID(),
        type: 'moderation.approved',
        entityType: 'organization',
        entityId: command.organizationId as string,
      });

      return Right(undefined);
    });
  }
}

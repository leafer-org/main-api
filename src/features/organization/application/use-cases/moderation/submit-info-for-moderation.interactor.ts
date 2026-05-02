import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { OrganizationEventPublisher, OrganizationRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class SubmitInfoForModerationInteractor {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(OrganizationEventPublisher) private readonly eventPublisher: OrganizationEventPublisher,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { organizationId: OrganizationId; userId: UserId }) {
    const auth = await this.permissionCheck.mustHavePermission(
      command.organizationId,
      command.userId,
      'publish_organization',
      { globalBypass: Permission.OrganizationInfoPublish },
    );
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, command.organizationId);
      if (!state) return Left(new OrganizationNotFoundError());

      const result = OrganizationEntity.submitInfoForModeration(state, {
        type: 'SubmitInfoForModeration',
        now,
      });
      if (isLeft(result)) return result;

      const { state: newState, event } = result.value;
      await this.organizationRepository.save(tx, newState);
      await this.eventPublisher.publishModerationRequested(tx, {
        id: crypto.randomUUID(),
        type: 'organization.moderation-requested',
        organizationId: state.id,
        name: event.name,
        description: event.description,
        avatarId: event.avatarId,
        media: event.media,
        submittedAt: event.submittedAt,
      });

      return Right(undefined);
    });
  }
}

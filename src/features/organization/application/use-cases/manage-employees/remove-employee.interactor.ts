import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { OrganizationEventPublisher, OrganizationRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RemoveEmployeeInteractor {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(OrganizationEventPublisher)
    private readonly eventPublisher: OrganizationEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    organizationId: OrganizationId;
    userId: UserId;
    targetUserId: UserId;
  }) {
    const auth = await this.permissionCheck.mustHavePermission(
      command.organizationId,
      command.userId,
      'manage_employees',
    );
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, command.organizationId);
      if (!state) return Left(new OrganizationNotFoundError());

      const result = OrganizationEntity.removeEmployee(state, {
        type: 'RemoveEmployee',
        userId: command.targetUserId,
        now,
      });
      if (isLeft(result)) return result;

      await this.organizationRepository.save(tx, result.value.state);

      await this.eventPublisher.publishRespondabilityChanged(tx, {
        id: randomUUID(),
        type: 'organization.respondability-changed',
        organizationId: command.organizationId,
        userId: command.targetUserId,
        changedAt: now,
      });

      return Right(undefined);
    });
  }
}

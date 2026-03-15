import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { OrganizationRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class RegenerateClaimTokenInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { organizationId: OrganizationId }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageOrganization);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();
    const newToken = crypto.randomUUID();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, command.organizationId);
      if (!state) return Left(new OrganizationNotFoundError());

      const result = OrganizationEntity.regenerateClaimToken(state, {
        type: 'RegenerateClaimToken',
        newToken,
        now,
      });
      if (isLeft(result)) return result;

      await this.organizationRepository.save(tx, result.value.state);

      return Right({ claimToken: newToken });
    });
  }
}

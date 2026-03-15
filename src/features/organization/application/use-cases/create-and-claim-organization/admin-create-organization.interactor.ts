import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationRepository } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { EmployeeRoleId, MediaId, OrganizationId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class AdminCreateOrganizationInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    id: OrganizationId;
    name: string;
    description: string;
    avatarId: MediaId | null;
    media: MediaItem[];
    adminRoleId: EmployeeRoleId;
    claimToken: string;
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageOrganization);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const result = OrganizationEntity.adminCreate({
        type: 'AdminCreateOrganization',
        id: command.id,
        name: command.name,
        description: command.description,
        avatarId: command.avatarId,
        media: command.media,
        adminRoleId: command.adminRoleId,
        claimToken: command.claimToken,
        now,
      });

      if (isLeft(result)) return result;

      const { state } = result.value;
      await this.organizationRepository.save(tx, state);

      return Right({ organizationId: state.id, claimToken: command.claimToken });
    });
  }
}

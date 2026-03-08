import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationRepository } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { EmployeeRoleId, FileId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class CreateOrganizationInteractor {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    id: OrganizationId;
    creatorUserId: UserId;
    name: string;
    description: string;
    avatarId: FileId | null;
    adminRoleId: EmployeeRoleId;
  }) {
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const result = OrganizationEntity.create({
        type: 'CreateOrganization',
        id: command.id,
        creatorUserId: command.creatorUserId,
        name: command.name,
        description: command.description,
        avatarId: command.avatarId,
        adminRoleId: command.adminRoleId,
        now,
      });

      if (isLeft(result)) return result;

      const { state } = result.value;
      await this.organizationRepository.save(tx, state);

      return Right(state);
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { InvalidClaimTokenError } from '../../../domain/aggregates/organization/errors.js';
import { ClaimTokenQueryPort, OrganizationRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ClaimOrganizationInteractor {
  public constructor(
    @Inject(ClaimTokenQueryPort) private readonly claimTokenQuery: ClaimTokenQueryPort,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { token: string; userId: UserId }) {
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.claimTokenQuery.findOrganizationByClaimToken(tx, command.token);
      if (!state) return Left(new InvalidClaimTokenError());

      const result = OrganizationEntity.claim(state, {
        type: 'ClaimOrganization',
        claimToken: command.token,
        userId: command.userId,
        now,
      });
      if (isLeft(result)) return result;

      await this.organizationRepository.save(tx, result.value.state);

      return Right(result.value.state);
    });
  }
}

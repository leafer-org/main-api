import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class RejectInfoModerationHandler {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async handle(event: { organizationId: OrganizationId }): Promise<void> {
    const now = this.clock.now();

    await this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, event.organizationId);
      if (!state) return;

      const result = OrganizationEntity.rejectInfoModeration(state, {
        type: 'RejectInfoModeration',
        now,
      });
      if (isLeft(result)) return;

      await this.organizationRepository.save(tx, result.value.state);
    });
  }
}

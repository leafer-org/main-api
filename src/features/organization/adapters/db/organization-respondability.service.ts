import { Inject, Injectable } from '@nestjs/common';

import { OrganizationRepository } from '../../application/ports.js';
import { OrganizationRespondabilityPort } from '@/kernel/application/ports/organization-respondability.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleOrganizationRespondabilityService extends OrganizationRespondabilityPort {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
  ) {
    super();
  }

  public async exists(orgId: OrganizationId): Promise<boolean> {
    const org = await this.organizationRepository.findById(NO_TRANSACTION, orgId);
    return org !== null;
  }

  public async canRespondAsOrganization(
    orgId: OrganizationId,
    userId: UserId,
  ): Promise<boolean> {
    const org = await this.organizationRepository.findById(NO_TRANSACTION, orgId);
    if (!org) return false;
    return org.employees.some((e) => (e.userId as string) === (userId as string));
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { OrganizationRepository } from '../../application/ports.js';
import {
  OrganizationActorPort,
  type OrgCapability,
} from '@/kernel/application/ports/organization-actor.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleOrganizationActorService implements OrganizationActorPort {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
  ) {}

  public async canActAs(
    orgId: OrganizationId,
    userId: UserId,
    capability: OrgCapability,
  ): Promise<boolean> {
    void capability;
    const org = await this.organizationRepository.findById(NO_TRANSACTION, orgId);
    if (!org) return false;
    return org.employees.some((e) => (e.userId as string) === (userId as string));
  }
}

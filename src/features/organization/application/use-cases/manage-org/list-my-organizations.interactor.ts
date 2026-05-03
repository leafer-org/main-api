import { Inject, Injectable } from '@nestjs/common';

import { OrganizationQueryPort } from '../../ports.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ListMyOrganizationsInteractor {
  public constructor(
    @Inject(OrganizationQueryPort) private readonly organizationQuery: OrganizationQueryPort,
  ) {}

  public async execute(command: { userId: UserId }) {
    return this.organizationQuery.findByEmployeeUserId(command.userId);
  }
}

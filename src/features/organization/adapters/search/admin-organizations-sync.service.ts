import { Inject, Injectable } from '@nestjs/common';

import { AdminOrganizationsListRepository } from '../../application/ports.js';
import type { AdminOrganizationsListReadModel } from '../../domain/read-models/admin-organizations-list.read-model.js';
import type { OrganizationJsonState } from '../db/json-state.js';

@Injectable()
export class AdminOrganizationsSyncService {
  public constructor(
    @Inject(AdminOrganizationsListRepository)
    private readonly repo: AdminOrganizationsListRepository,
  ) {}

  public async syncFromState(orgId: string, state: OrganizationJsonState): Promise<void> {
    const model: AdminOrganizationsListReadModel = {
      organizationId: orgId,
      name: state.infoDraft.name,
      description: state.infoDraft.description,
      infoDraftStatus: state.infoDraft.status,
      hasPublication: state.infoPublication !== null,
      employeeCount: state.employees.length,
      planId: state.subscription.planId,
      isClaimed: state.employees.some((e) => e.isOwner),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };

    await this.repo.saveBatch([model]);
  }
}

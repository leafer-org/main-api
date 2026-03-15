import { Inject, Injectable } from '@nestjs/common';

import { AdminOrganizationsListRepository } from '../../application/ports.js';
import type { AdminOrganizationsListReadModel } from '../../domain/read-models/admin-organizations-list.read-model.js';
import { ADMIN_ORGANIZATIONS_INDEX, AdminOrganizationsSearchClient } from './admin-organizations.index.js';

@Injectable()
export class MeiliAdminOrganizationsListRepository implements AdminOrganizationsListRepository {
  public constructor(
    @Inject(AdminOrganizationsSearchClient)
    private readonly searchClient: InstanceType<typeof AdminOrganizationsSearchClient>,
  ) {}

  public async saveBatch(models: AdminOrganizationsListReadModel[]): Promise<void> {
    if (models.length === 0) return;

    await this.searchClient.bulkIndex(
      ADMIN_ORGANIZATIONS_INDEX,
      models.map((m) => ({ id: m.organizationId, document: m })),
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { AdminOrganizationsListQueryPort } from '../../application/ports.js';
import type { AdminOrganizationsListReadModel } from '../../domain/read-models/admin-organizations-list.read-model.js';
import { ADMIN_ORGANIZATIONS_INDEX, AdminOrganizationsSearchClient } from './admin-organizations.index.js';

@Injectable()
export class MeiliAdminOrganizationsListQuery implements AdminOrganizationsListQueryPort {
  public constructor(
    @Inject(AdminOrganizationsSearchClient)
    private readonly searchClient: InstanceType<typeof AdminOrganizationsSearchClient>,
  ) {}

  public async search(params: {
    query?: string;
    status?: string;
    from?: number;
    size?: number;
  }): Promise<{ organizations: AdminOrganizationsListReadModel[]; total: number }> {
    const filters: string[] = [];
    if (params.status) {
      filters.push(`infoDraftStatus = "${params.status}"`);
    }

    const result = await this.searchClient.search<AdminOrganizationsListReadModel>(
      ADMIN_ORGANIZATIONS_INDEX,
      {
        q: params.query ?? '',
        filter: filters.length > 0 ? filters.join(' AND ') : undefined,
        sort: ['createdAt:desc'],
        offset: params.from ?? 0,
        limit: params.size ?? 20,
      },
    );

    return {
      organizations: result.hits,
      total: result.total,
    };
  }
}

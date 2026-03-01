import { Inject, Injectable } from '@nestjs/common';

import { AdminUsersListQueryPort } from '../../application/ports.js';
import type { AdminUsersListReadModel } from '../../domain/read-models/admin-users-list/admin-users-list.read-model.js';
import { ADMIN_USERS_INDEX, AdminUsersSearchClient } from './admin-users.index.js';

@Injectable()
export class MeiliAdminUsersListQuery implements AdminUsersListQueryPort {
  public constructor(
    @Inject(AdminUsersSearchClient)
    private readonly searchClient: InstanceType<typeof AdminUsersSearchClient>,
  ) {}

  public async search(params: {
    query?: string;
    role?: string;
    from?: number;
    size?: number;
  }): Promise<{ users: AdminUsersListReadModel[]; total: number }> {
    const result = await this.searchClient.search<AdminUsersListReadModel>(ADMIN_USERS_INDEX, {
      q: params.query ?? '',
      filter: params.role ? `role = "${params.role}"` : undefined,
      sort: ['createdAt:desc'],
      offset: params.from ?? 0,
      limit: params.size ?? 20,
    });

    return {
      users: result.hits,
      total: result.total,
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { AdminUsersListRepository } from '../../application/ports.js';
import type { AdminUsersListReadModel } from '../../domain/read-models/admin-users-list/admin-users-list.read-model.js';
import { ADMIN_USERS_INDEX, AdminUsersSearchClient } from './admin-users.index.js';

@Injectable()
export class MeiliAdminUsersListRepository implements AdminUsersListRepository {
  public constructor(
    @Inject(AdminUsersSearchClient)
    private readonly searchClient: InstanceType<typeof AdminUsersSearchClient>,
  ) {}

  public async saveBatch(models: AdminUsersListReadModel[]): Promise<void> {
    if (models.length === 0) return;

    await this.searchClient.bulkIndex(
      ADMIN_USERS_INDEX,
      models.map((m) => ({ id: m.userId, document: m })),
    );
  }
}

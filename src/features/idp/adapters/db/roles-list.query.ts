import { Injectable } from '@nestjs/common';

import { RolesListQueryPort } from '../../application/ports.js';
import type { RolesListReadModel } from '../../domain/read-models/roles-list.read-model.js';
import { IdpDatabaseClient } from './client.js';
import { roles } from './schema.js';
import { RoleId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleRolesListQuery extends RolesListQueryPort {
  public constructor(private readonly dbClient: IdpDatabaseClient) {
    super();
  }

  public async findAll(): Promise<RolesListReadModel> {
    const rows = await this.dbClient.db.select().from(roles);

    return {
      roles: rows.map((row) => ({
        id: RoleId.raw(row.id),
        name: row.name,
        permissions: (row.permissions ?? {}) as Record<string, unknown>,
        isStatic: row.isStatic,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }
}

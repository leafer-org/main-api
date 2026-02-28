import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { RoleQueryPort } from '../../application/ports.js';
import type { RoleReadModel } from '../../domain/read-models/role.read-model.js';
import { IdpDatabaseClient } from './client.js';
import { roles } from './schema.js';
import { RoleId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleRoleQuery extends RoleQueryPort {
  public constructor(private readonly dbClient: IdpDatabaseClient) {
    super();
  }

  public async findRole(roleId: RoleId): Promise<RoleReadModel | null> {
    const rows = await this.dbClient.db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      id: RoleId.raw(row.id),
      name: row.name,
      permissions: (row.permissions ?? {}) as Record<string, unknown>,
      isStatic: row.isStatic,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

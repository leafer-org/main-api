import { Inject } from '@nestjs/common';

import type { PermissionsMap } from './permissions-store.js';
import { PermissionsStore } from './permissions-store.js';
import { IdpDatabaseClient } from '@/features/idp/adapters/db/client.js';
import { roles } from '@/features/idp/adapters/db/schema.js';

export class DynamicPermissionsStore extends PermissionsStore {
  public constructor(
    @Inject(IdpDatabaseClient)
    private readonly db: IdpDatabaseClient,
  ) {
    super();
  }

  public async get(): Promise<PermissionsMap> {
    const allRoles = await this.db.select().from(roles);
    const rolesMap = Object.fromEntries(
      allRoles.map((r) => [r.name, (r.permissions ?? {}) as Record<string, unknown>]),
    );
    return { roles: rolesMap };
  }
}

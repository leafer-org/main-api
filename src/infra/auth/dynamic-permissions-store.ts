import { Injectable, type OnModuleInit } from '@nestjs/common';

import { roles } from '@/features/idp/adapters/db/schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { PermissionsMap } from '@/infra/lib/authorization/permissions-store.js';
import { PermissionsStore } from '@/infra/lib/authorization/permissions-store.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';

@Injectable()
export class DynamicPermissionsStore extends PermissionsStore implements OnModuleInit {
  private cached: PermissionsMap = { roles: {} };

  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    const db = this.txHost.get(NO_TRANSACTION);
    const allRoles = await db.select().from(roles);
    const rolesMap = Object.fromEntries(
      allRoles.map((r) => [r.name, (r.permissions ?? {}) as Record<string, unknown>]),
    );
    this.cached = { roles: rolesMap };
  }

  public get(): PermissionsMap {
    return this.cached;
  }
}

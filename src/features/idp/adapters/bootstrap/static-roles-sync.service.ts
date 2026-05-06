import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { IdpDatabaseClient } from '../db/client.js';
import { roles } from '../db/schema.js';
import { ALL_PERMISSIONS, type Permission } from '@/kernel/domain/permissions.js';

const USER_DEFAULT_PERMISSIONS: readonly Permission[] = [];

@Injectable()
export class StaticRolesSyncService implements OnModuleInit {
  private readonly logger = new Logger(StaticRolesSyncService.name);

  public constructor(
    @Inject(IdpDatabaseClient) private readonly db: IdpDatabaseClient,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.syncRole('ADMIN', [...ALL_PERMISSIONS]);
    await this.syncRole('USER', [...USER_DEFAULT_PERMISSIONS]);
  }

  private async syncRole(name: string, expected: Permission[]): Promise<void> {
    const existing = await this.db.select().from(roles).where(eq(roles.name, name)).limit(1);

    if (existing.length === 0) {
      await this.db.insert(roles).values({
        name,
        permissions: expected,
        isStatic: true,
      });
      this.logger.log(`${name} role created with ${expected.length} permissions`);
      return;
    }

    const current = (existing[0]!.permissions ?? []) as string[];
    const drift =
      current.length !== expected.length || expected.some((p) => !current.includes(p));
    if (!drift) return;

    await this.db
      .update(roles)
      .set({ permissions: expected, isStatic: true, updatedAt: new Date() })
      .where(eq(roles.name, name));
    this.logger.log(`${name} role synced (${current.length} → ${expected.length} permissions)`);
  }
}

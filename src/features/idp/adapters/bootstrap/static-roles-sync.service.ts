import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { IdpDatabaseClient } from '../db/client.js';
import { roles } from '../db/schema.js';
import { ALL_PERMISSIONS } from '@/kernel/domain/permissions.js';

@Injectable()
export class StaticRolesSyncService implements OnModuleInit {
  private readonly logger = new Logger(StaticRolesSyncService.name);

  public constructor(
    @Inject(IdpDatabaseClient) private readonly db: IdpDatabaseClient,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.syncAdmin();
    await this.ensureUser();
  }

  private async syncAdmin(): Promise<void> {
    const all = [...ALL_PERMISSIONS];
    const existing = await this.db
      .select()
      .from(roles)
      .where(eq(roles.name, 'ADMIN'))
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(roles).values({
        name: 'ADMIN',
        permissions: all,
        isStatic: true,
      });
      this.logger.log(`ADMIN role created with ${all.length} permissions`);
      return;
    }

    const current = (existing[0]!.permissions ?? []) as string[];
    const drift = current.length !== all.length || all.some((p) => !current.includes(p));
    if (!drift) return;

    await this.db
      .update(roles)
      .set({ permissions: all, isStatic: true, updatedAt: new Date() })
      .where(eq(roles.name, 'ADMIN'));
    this.logger.log(`ADMIN role synced (${current.length} → ${all.length} permissions)`);
  }

  private async ensureUser(): Promise<void> {
    const existing = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, 'USER'))
      .limit(1);

    if (existing.length > 0) return;

    await this.db.insert(roles).values({
      name: 'USER',
      permissions: [],
      isStatic: true,
    });
    this.logger.log('USER role created');
  }
}

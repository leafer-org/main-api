import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { users } from './schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import {
  type UserDirectoryView,
  UserDirectoryPort,
} from '@/kernel/application/ports/user-directory.js';
import { MediaId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleUserDirectoryAdapter implements UserDirectoryPort {
  public constructor(private readonly connectionPool: ConnectionPool) {}

  public async findById(id: UserId): Promise<UserDirectoryView | null> {
    const rows = await this.connectionPool.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.toView(row);
  }

  public async findByIds(ids: readonly UserId[]): Promise<UserDirectoryView[]> {
    if (ids.length === 0) return [];

    const rows = await this.connectionPool.db
      .select()
      .from(users)
      .where(inArray(users.id, ids as UserId[]));

    return rows.map((row) => this.toView(row));
  }

  private toView(row: typeof users.$inferSelect): UserDirectoryView {
    return {
      userId: UserId.raw(row.id),
      fullName: row.fullName ?? '',
      avatarMediaId: row.avatarFileId ? MediaId.raw(row.avatarFileId) : null,
      cityId: row.cityId,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      role: row.role,
      phoneNumber: row.phoneNumber,
      blockedAt: row.blockedAt ?? null,
      blockReason: row.blockReason ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

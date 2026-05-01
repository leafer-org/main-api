import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { users } from './schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import { type UserSummary, UserLookupPort } from '@/kernel/application/ports/user-lookup.js';
import { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleUserLookupAdapter implements UserLookupPort {
  public constructor(private readonly connectionPool: ConnectionPool) {}

  public async findByPhone(phone: string): Promise<{ userId: UserId } | null> {
    const normalized = phone.replace(/\D/g, '');
    const rows = await this.connectionPool.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneNumber, normalized))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return { userId: UserId.raw(row.id) };
  }

  public async findByIds(ids: UserId[]): Promise<UserSummary[]> {
    if (ids.length === 0) return [];

    const rows = await this.connectionPool.db
      .select({
        id: users.id,
        fullName: users.fullName,
        phoneNumber: users.phoneNumber,
        role: users.role,
      })
      .from(users)
      .where(inArray(users.id, ids));

    return rows.map((row) => ({
      userId: UserId.raw(row.id),
      fullName: row.fullName ?? '',
      phone: row.phoneNumber,
      role: row.role,
    }));
  }
}

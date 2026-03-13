import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { users } from './schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import { UserLookupPort } from '@/kernel/application/ports/user-lookup.js';
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
}

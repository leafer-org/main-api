import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { UserRepository } from '../../application/ports.js';
import type { UserState } from '../../domain/aggregates/user/state.js';
import { PhoneNumber } from '../../domain/vo/phone-number.js';
import { users } from './schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

@Injectable()
export class DrizzleUserRepository extends UserRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, userId: UserId): Promise<UserState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row);
  }

  public async findByPhoneNumber(
    tx: Transaction,
    phoneNumber: PhoneNumber,
  ): Promise<{ id: UserId; role: Role } | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber as string))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return { id: UserId.raw(row.id), role: Role.raw(row.role) };
  }

  public async save(tx: Transaction, state: UserState): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(users)
      .values({
        id: state.id,
        phoneNumber: state.phoneNumber as string,
        fullName: state.fullName as string,
        role: state.role as 'ADMIN' | 'USER',
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          phoneNumber: state.phoneNumber as string,
          fullName: state.fullName as string,
          role: state.role as 'ADMIN' | 'USER',
          updatedAt: state.updatedAt,
        },
      });
  }

  private toDomain(row: typeof users.$inferSelect): UserState {
    return {
      id: UserId.raw(row.id),
      phoneNumber: PhoneNumber.raw(row.phoneNumber),
      fullName: row.fullName as UserState['fullName'],
      role: Role.raw(row.role),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

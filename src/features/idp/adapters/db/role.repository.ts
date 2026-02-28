import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { RoleRepository } from '../../application/ports.js';
import type { RoleState } from '../../domain/aggregates/role/state.js';
import { roles } from './schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { RoleId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleRoleRepository implements RoleRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, id: RoleId): Promise<RoleState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);
  }

  public async findByName(tx: Transaction, name: string): Promise<RoleState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(roles).where(eq(roles.name, name)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);
  }

  public async findAll(tx: Transaction): Promise<RoleState[]> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(roles);
    return rows.map((row) => this.toDomain(row));
  }

  public async save(tx: Transaction, state: RoleState): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(roles)
      .values({
        id: state.id,
        name: state.name,
        permissions: state.permissions,
        isStatic: state.isStatic,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: roles.id,
        set: {
          name: state.name,
          permissions: state.permissions,
          updatedAt: state.updatedAt,
        },
      });
  }

  public async deleteById(tx: Transaction, id: RoleId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(roles).where(eq(roles.id, id));
  }

  private toDomain(row: typeof roles.$inferSelect): RoleState {
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

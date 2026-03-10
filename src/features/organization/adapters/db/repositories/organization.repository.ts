import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationRepository } from '../../../application/ports.js';
import { organizations } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleOrganizationRepository extends OrganizationRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, id: OrganizationId): Promise<OrganizationEntity | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row.state);
  }

  public async save(tx: Transaction, state: OrganizationEntity): Promise<void> {
    const db = this.txHost.get(tx);

    await db
      .insert(organizations)
      .values({
        id: state.id,
        state: this.toJson(state),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: organizations.id,
        set: {
          state: this.toJson(state),
          updatedAt: state.updatedAt,
        },
      });
  }

  private toJson(state: OrganizationEntity): unknown {
    return {
      ...state,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
      infoPublication: state.infoPublication
        ? {
            ...state.infoPublication,
            publishedAt: state.infoPublication.publishedAt.toISOString(),
          }
        : null,
      employees: state.employees.map((e) => ({
        ...e,
        joinedAt: e.joinedAt.toISOString(),
      })),
    };
  }

  private toDomain(json: unknown): OrganizationEntity {
    const raw = json as Record<string, unknown>;
    const state = raw as unknown as OrganizationEntity;

    return {
      ...state,
      createdAt: new Date(raw['createdAt'] as string),
      updatedAt: new Date(raw['updatedAt'] as string),
      infoPublication: state.infoPublication
        ? {
            ...state.infoPublication,
            publishedAt: new Date(state.infoPublication.publishedAt as unknown as string),
          }
        : null,
      employees: state.employees.map((e) => ({
        ...e,
        joinedAt: new Date(e.joinedAt as unknown as string),
      })),
    };
  }
}

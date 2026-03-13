import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { ItemRepository } from '../../../application/ports.js';
import type { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { items } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { ItemId, OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleItemRepository extends ItemRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, itemId: ItemId): Promise<ItemEntity | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row.state);
  }

  public async findPublishedByOrganizationId(
    tx: Transaction,
    orgId: OrganizationId,
  ): Promise<ItemEntity[]> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.organizationId, orgId),
          sql`${items.state}->'publication' IS NOT NULL AND ${items.state}->'publication' != 'null'::jsonb`,
        ),
      );

    return rows.map((row) => this.toDomain(row.state));
  }

  public async countPublishedByOrganizationId(
    tx: Transaction,
    orgId: OrganizationId,
  ): Promise<number> {
    const db = this.txHost.get(tx);
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(items)
      .where(
        and(
          eq(items.organizationId, orgId),
          sql`${items.state}->'publication' IS NOT NULL AND ${items.state}->'publication' != 'null'::jsonb`,
        ),
      );

    return result[0]?.count ?? 0;
  }

  public async save(tx: Transaction, state: ItemEntity): Promise<void> {
    const db = this.txHost.get(tx);

    await db
      .insert(items)
      .values({
        id: state.itemId,
        organizationId: state.organizationId as string,
        typeId: state.typeId as string,
        state: this.toJson(state),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: items.id,
        set: {
          organizationId: state.organizationId as string,
          typeId: state.typeId as string,
          state: this.toJson(state),
          updatedAt: state.updatedAt,
        },
      });
  }

  public async delete(tx: Transaction, itemId: ItemId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(items).where(eq(items.id, itemId));
  }

  private toJson(state: ItemEntity): unknown {
    return {
      ...state,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
      draft: state.draft
        ? {
            ...state.draft,
            updatedAt: state.draft.updatedAt.toISOString(),
          }
        : null,
      publication: state.publication
        ? {
            ...state.publication,
            publishedAt: state.publication.publishedAt.toISOString(),
          }
        : null,
    };
  }

  private toDomain(json: unknown): ItemEntity {
    const raw = json as Record<string, unknown>;
    const state = raw as unknown as ItemEntity;

    return {
      ...state,
      createdAt: new Date(raw['createdAt'] as string),
      updatedAt: new Date(raw['updatedAt'] as string),
      draft: state.draft
        ? {
            ...state.draft,
            updatedAt: new Date(state.draft.updatedAt as unknown as string),
          }
        : null,
      publication: state.publication
        ? {
            ...state.publication,
            publishedAt: new Date(state.publication.publishedAt as unknown as string),
          }
        : null,
    };
  }
}

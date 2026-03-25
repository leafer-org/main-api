import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { OrganizationRepository } from '../../../application/ports.js';
import type { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { AdminOrganizationsSyncService } from '../../search/admin-organizations-sync.service.js';
import type { OrganizationJsonState } from '../json-state.js';
import { organizations } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleOrganizationRepository extends OrganizationRepository {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(AdminOrganizationsSyncService)
    private readonly searchSync: AdminOrganizationsSyncService,
  ) {
    super();
  }

  public async findById(tx: Transaction, id: OrganizationId): Promise<OrganizationEntity | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row.state, row.claimToken);
  }

  public async save(tx: Transaction, state: OrganizationEntity): Promise<void> {
    const db = this.txHost.get(tx);
    const json = this.toJson(state);

    await db
      .insert(organizations)
      .values({
        id: state.id,
        state: json,
        claimToken: state.claimToken,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: organizations.id,
        set: {
          state: json,
          claimToken: state.claimToken,
          updatedAt: state.updatedAt,
        },
      });

    this.searchSync
      .syncFromState(state.id as string, json as OrganizationJsonState)
      .catch(() => {});
  }

  public async delete(tx: Transaction, id: OrganizationId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(organizations).where(eq(organizations.id, id));
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

  private toDomain(json: unknown, claimToken: string | null): OrganizationEntity {
    const raw = json as Record<string, unknown>;
    const state = raw as unknown as OrganizationEntity;

    return {
      ...state,
      claimToken,
      createdAt: new Date(raw['createdAt'] as string),
      updatedAt: new Date(raw['updatedAt'] as string),
      infoDraft: {
        ...state.infoDraft,
        contacts: state.infoDraft.contacts ?? [],
        team: state.infoDraft.team ?? { title: '', members: [] },
      },
      infoPublication: state.infoPublication
        ? {
            ...state.infoPublication,
            contacts: state.infoPublication.contacts ?? [],
            team: state.infoPublication.team ?? { title: '', members: [] },
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

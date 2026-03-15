import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ClaimTokenQueryPort } from '../../../application/ports.js';
import type { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationDatabaseClient } from '../client.js';
import { organizations } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';

@Injectable()
export class DrizzleClaimTokenQuery implements ClaimTokenQueryPort {
  public constructor(
    @Inject(OrganizationDatabaseClient) private readonly db: OrganizationDatabaseClient,
    private readonly txHost: TransactionHostPg,
  ) {}

  public async findOrganizationByClaimToken(
    tx: Transaction,
    token: string,
  ): Promise<OrganizationEntity | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.claimToken, token))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row.state, row.claimToken);
  }

  private toDomain(json: unknown, claimToken: string | null): OrganizationEntity {
    const raw = json as Record<string, unknown>;
    const state = raw as unknown as OrganizationEntity;

    return {
      ...state,
      claimToken,
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

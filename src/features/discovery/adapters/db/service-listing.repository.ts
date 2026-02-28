import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { ServiceId } from '@/kernel/domain/ids.js';
import type { ServiceComponent } from '@/kernel/domain/service-component.js';
import { ServiceListingRepository } from '../../application/ports.js';
import type { ServiceListingReadModel } from '../../domain/read-models/service-listing/service-listing.read-model.js';
import { serviceListings } from './schema.js';
import { assertNever } from '@/infra/ddd/utils.js';

@Injectable()
export class DrizzleServiceListingRepository implements ServiceListingRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findByServiceId(
    tx: Transaction,
    serviceId: ServiceId,
  ): Promise<ServiceListingReadModel | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(serviceListings)
      .where(eq(serviceListings.serviceId, serviceId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);
  }

  public async save(tx: Transaction, model: ServiceListingReadModel): Promise<void> {
    const db = this.txHost.get(tx);
    const denormalized = this.extractDenormalized(model.components);

    await db
      .insert(serviceListings)
      .values({
        serviceId: model.serviceId,
        components: model.components,
        categoryId: denormalized.categoryId,
        organizationId: denormalized.organizationId,
        ageGroup: denormalized.ageGroup,
        publishedAt: model.publishedAt,
        updatedAt: model.updatedAt,
      })
      .onConflictDoUpdate({
        target: serviceListings.serviceId,
        set: {
          components: model.components,
          categoryId: denormalized.categoryId,
          organizationId: denormalized.organizationId,
          ageGroup: denormalized.ageGroup,
          updatedAt: model.updatedAt,
        },
      });
  }

  public async deleteByServiceId(tx: Transaction, serviceId: ServiceId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(serviceListings).where(eq(serviceListings.serviceId, serviceId));
  }

  private toDomain(row: typeof serviceListings.$inferSelect): ServiceListingReadModel {
    return {
      serviceId: ServiceId.raw(row.serviceId),
      components: row.components as ServiceComponent[],
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    };
  }

  private extractDenormalized(components: ServiceComponent[]) {
    let categoryId: string | undefined;
    let organizationId: string | undefined;
    let ageGroup: string | undefined;

    for (const c of components) {
      switch (c.type) {
        case 'category':
          categoryId = c.categoryId;
          break;
        case 'organization':
          organizationId = c.organizationId;
          break;
        case 'age-group':
          ageGroup = c.value;
          break;
        default:
      }
    }

    return { categoryId, organizationId, ageGroup };
  }
}

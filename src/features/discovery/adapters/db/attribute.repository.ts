import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { AttributeId, CategoryId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/attribute.js';
import { AttributeRepository } from '../../application/ports.js';
import type { AttributeReadModel } from '../../domain/read-models/attribute.read-model.js';
import { attributes } from './schema.js';

@Injectable()
export class DrizzleAttributeRepository implements AttributeRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findByAttributeId(
    tx: Transaction,
    attributeId: AttributeId,
  ): Promise<AttributeReadModel | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(attributes)
      .where(eq(attributes.attributeId, attributeId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);
  }

  public async save(tx: Transaction, model: AttributeReadModel): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(attributes)
      .values({
        attributeId: model.attributeId,
        categoryId: model.categoryId,
        name: model.name,
        schema: model.schema,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      })
      .onConflictDoUpdate({
        target: attributes.attributeId,
        set: {
          name: model.name,
          schema: model.schema,
          updatedAt: model.updatedAt,
        },
      });
  }

  public async deleteByAttributeId(tx: Transaction, attributeId: AttributeId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(attributes).where(eq(attributes.attributeId, attributeId));
  }

  private toDomain(row: typeof attributes.$inferSelect): AttributeReadModel {
    return {
      attributeId: AttributeId.raw(row.attributeId),
      categoryId: CategoryId.raw(row.categoryId),
      name: row.name,
      schema: row.schema as AttributeSchema,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

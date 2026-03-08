import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { OwnerProjectionPort } from '../../../application/projection-ports.js';
import type { OwnerReadModel } from '../../../domain/read-models/owner.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryOwners } from '../schema.js';
import type { FileId, OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleOwnerProjectionRepository implements OwnerProjectionPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async upsert(owner: OwnerReadModel): Promise<void> {
    await this.dbClient.db
      .insert(discoveryOwners)
      .values({
        id: owner.ownerId as string,
        name: owner.name,
        avatarId: owner.avatarId as string | null,
        rating: owner.rating !== null && owner.rating !== undefined ? String(owner.rating) : null,
        reviewCount: owner.reviewCount,
        updatedAt: owner.updatedAt,
      })
      .onConflictDoUpdate({
        target: discoveryOwners.id,
        set: {
          name: owner.name,
          avatarId: owner.avatarId as string | null,
          rating: owner.rating !== null && owner.rating !== undefined ? String(owner.rating) : null,
          reviewCount: owner.reviewCount,
          updatedAt: owner.updatedAt,
        },
      });
  }

  public async updateData(
    ownerId: OrganizationId,
    data: { name: string; avatarId: FileId | null; updatedAt: Date },
  ): Promise<void> {
    await this.dbClient.db
      .update(discoveryOwners)
      .set({
        name: data.name,
        avatarId: data.avatarId as string | null,
        updatedAt: data.updatedAt,
      })
      .where(eq(discoveryOwners.id, ownerId as string));
  }

  public async updateReview(
    ownerId: OrganizationId,
    rating: number | null,
    reviewCount: number,
  ): Promise<void> {
    await this.dbClient.db
      .update(discoveryOwners)
      .set({
        rating: rating !== null && rating !== undefined ? String(rating) : null,
        reviewCount,
      })
      .where(eq(discoveryOwners.id, ownerId as string));
  }

  public async delete(ownerId: OrganizationId): Promise<void> {
    await this.dbClient.db.delete(discoveryOwners).where(eq(discoveryOwners.id, ownerId as string));
  }
}

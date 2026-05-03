import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { OwnerProjectionPort } from '../../../application/projection-ports.js';
import type { OwnerReadModel } from '../../../domain/read-models/owner.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryOwners } from '../schema.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

function serializeMedia(media: OwnerReadModel['media']) {
  return media.map((m) => ({ type: m.type, mediaId: m.mediaId as string }));
}

function serializeTeam(team: OwnerReadModel['team']) {
  if (!team) return null;
  return {
    title: team.title,
    members: team.members.map((m) => ({
      name: m.name,
      description: m.description,
      media: serializeMedia(m.media),
      employeeUserId: m.employeeUserId,
    })),
  };
}

@Injectable()
export class DrizzleOwnerProjectionRepository implements OwnerProjectionPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async upsert(owner: OwnerReadModel): Promise<void> {
    const payload = {
      id: owner.ownerId as string,
      name: owner.name,
      description: owner.description,
      avatarId: owner.avatarId as string | null,
      media: serializeMedia(owner.media),
      contacts: owner.contacts,
      team: serializeTeam(owner.team),
      rating: owner.rating !== null && owner.rating !== undefined ? String(owner.rating) : null,
      reviewCount: owner.reviewCount,
      updatedAt: owner.updatedAt,
    };

    await this.dbClient.db
      .insert(discoveryOwners)
      .values(payload)
      .onConflictDoUpdate({
        target: discoveryOwners.id,
        set: {
          name: payload.name,
          description: payload.description,
          avatarId: payload.avatarId,
          media: payload.media,
          contacts: payload.contacts,
          team: payload.team,
          rating: payload.rating,
          reviewCount: payload.reviewCount,
          updatedAt: payload.updatedAt,
        },
      });
  }

  public async updateData(
    ownerId: OrganizationId,
    data: Pick<OwnerReadModel, 'name' | 'description' | 'avatarId' | 'media' | 'contacts' | 'team'> & {
      updatedAt: Date;
    },
  ): Promise<void> {
    await this.dbClient.db
      .update(discoveryOwners)
      .set({
        name: data.name,
        description: data.description,
        avatarId: data.avatarId as string | null,
        media: serializeMedia(data.media),
        contacts: data.contacts,
        team: serializeTeam(data.team),
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

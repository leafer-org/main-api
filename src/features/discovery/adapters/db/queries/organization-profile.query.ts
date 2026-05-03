import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { OrganizationProfileQueryPort } from '../../../application/ports.js';
import type { OrganizationProfileReadModel } from '../../../domain/read-models/organization-profile.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryOwners } from '../schema.js';
import { MediaId, OrganizationId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

@Injectable()
export class DrizzleOrganizationProfileQuery implements OrganizationProfileQueryPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async findById(organizationId: string): Promise<OrganizationProfileReadModel | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(discoveryOwners)
      .where(eq(discoveryOwners.id, organizationId));

    if (!row) return null;

    const media: MediaItem[] = (row.media ?? []).map((m) => ({
      type: m.type as 'image' | 'video',
      mediaId: MediaId.raw(m.mediaId),
    }));

    return {
      organizationId: OrganizationId.raw(row.id),
      name: row.name,
      description: row.description ?? '',
      avatarId: row.avatarId ? MediaId.raw(row.avatarId) : null,
      media,
      contacts: row.contacts ?? [],
      team: row.team
        ? {
            title: row.team.title,
            members: row.team.members.map((m) => ({
              name: m.name,
              description: m.description,
              media: m.media.map((mm) => ({
                type: mm.type as 'image' | 'video',
                mediaId: MediaId.raw(mm.mediaId),
              })),
              employeeUserId: m.employeeUserId,
            })),
          }
        : null,
      rating: row.rating !== null ? Number(row.rating) : null,
      reviewCount: row.reviewCount,
    };
  }
}

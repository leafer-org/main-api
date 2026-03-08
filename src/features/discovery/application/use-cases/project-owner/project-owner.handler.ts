import { Inject, Injectable } from '@nestjs/common';

import type {
  OrganizationPublishedEvent,
  OrganizationUnpublishedEvent,
} from '@/kernel/domain/events/organization.events.js';

import { OrganizationId } from '@/kernel/domain/ids.js';

import { projectOwnerFromOrganization } from '../../../domain/read-models/owner.read-model.js';
import { IdempotencyPort, ItemProjectionPort, OwnerProjectionPort } from '../../projection-ports.js';
import { ItemQueryPort } from '../../ports.js';
import { GorseSyncPort, MeilisearchSyncPort } from '../../sync-ports.js';

@Injectable()
export class ProjectOwnerHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(OwnerProjectionPort) private readonly ownerProjection: OwnerProjectionPort,
    @Inject(ItemProjectionPort) private readonly itemProjection: ItemProjectionPort,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
    @Inject(MeilisearchSyncPort) private readonly meilisearch: MeilisearchSyncPort,
  ) {}

  public async handleOrganizationPublished(
    eventId: string,
    payload: OrganizationPublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const ownerId = OrganizationId.raw(payload.organizationId);

    if (payload.republished) {
      await this.ownerProjection.updateData(ownerId, {
        name: payload.name,
        avatarId: payload.avatarId,
        updatedAt: payload.publishedAt,
      });

      const affectedItemIds = await this.itemProjection.updateOwnerData(ownerId, {
        name: payload.name,
        avatarId: payload.avatarId,
      });
      const items = await this.itemQuery.findByIds(affectedItemIds);
      await this.meilisearch.upsertItems(items);
    } else {
      const owner = projectOwnerFromOrganization(payload);
      await this.ownerProjection.upsert(owner);
    }

    await this.idempotency.markProcessed(eventId);
  }

  public async handleOrganizationUnpublished(
    eventId: string,
    payload: OrganizationUnpublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const ownerId = OrganizationId.raw(payload.organizationId);
    await this.ownerProjection.delete(ownerId);

    const affectedItemIds = await this.itemProjection.deleteByOrganizationId(ownerId);
    await Promise.all(
      affectedItemIds.map(async (itemId) => {
        await this.gorse.deleteItem(itemId);
        await this.meilisearch.deleteItem(itemId);
      }),
    );

    await this.idempotency.markProcessed(eventId);
  }
}

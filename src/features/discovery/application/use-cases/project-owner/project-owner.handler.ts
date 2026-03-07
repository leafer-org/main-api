import { Inject, Injectable } from '@nestjs/common';

import type {
  OrganizationPublishedEvent,
  OrganizationUnpublishedEvent,
} from '@/kernel/domain/events/organization.events.js';
import type {
  UserCreatedEvent,
  UserDeletedEvent,
  UserUpdatedEvent,
} from '@/kernel/domain/events/user.events.js';
import { OrganizationId } from '@/kernel/domain/ids.js';

import {
  projectOwnerFromOrganization,
  projectOwnerFromUser,
} from '../../../domain/read-models/owner.read-model.js';
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

    const owner = projectOwnerFromOrganization(payload);
    await this.ownerProjection.upsert(owner);

    if (payload.republished) {
      const affectedItemIds = await this.itemProjection.updateOwnerData(
        payload.organizationId,
        { name: payload.name, avatarId: payload.avatarId },
      );
      const items = await this.itemQuery.findByIds(affectedItemIds);
      await this.meilisearch.upsertItems(items);
    }

    await this.idempotency.markProcessed(eventId);
  }

  public async handleOrganizationUnpublished(
    eventId: string,
    payload: OrganizationUnpublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.ownerProjection.delete(OrganizationId.raw(payload.organizationId));

    const affectedItemIds = await this.itemProjection.deleteByOrganizationId(
      payload.organizationId,
    );
    for (const itemId of affectedItemIds) {
      await this.gorse.deleteItem(itemId);
      await this.meilisearch.deleteItem(itemId);
    }

    await this.idempotency.markProcessed(eventId);
  }

  public async handleUserCreated(eventId: string, payload: UserCreatedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const owner = projectOwnerFromUser(payload);
    await this.ownerProjection.upsert(owner);
    await this.idempotency.markProcessed(eventId);
  }

  public async handleUserUpdated(eventId: string, payload: UserUpdatedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const owner = projectOwnerFromUser(payload);
    await this.ownerProjection.upsert(owner);
    await this.idempotency.markProcessed(eventId);
  }

  public async handleUserDeleted(eventId: string, payload: UserDeletedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.ownerProjection.delete(OrganizationId.raw(payload.userId));
    await this.idempotency.markProcessed(eventId);
  }
}

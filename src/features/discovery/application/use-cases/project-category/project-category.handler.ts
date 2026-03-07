import { Inject, Injectable } from '@nestjs/common';

import type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';

import { projectAttributes } from '../../../domain/read-models/attribute.read-model.js';
import { projectCategory } from '../../../domain/read-models/category.read-model.js';
import {
  AttributeProjectionPort,
  CategoryProjectionPort,
  IdempotencyPort,
} from '../../projection-ports.js';

@Injectable()
export class ProjectCategoryHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(CategoryProjectionPort) private readonly categoryProjection: CategoryProjectionPort,
    @Inject(AttributeProjectionPort) private readonly attributeProjection: AttributeProjectionPort,
  ) {}

  public async handleCategoryPublished(
    eventId: string,
    payload: CategoryPublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const category = projectCategory(payload);
    await this.categoryProjection.upsert(category);

    const attributes = projectAttributes(payload.categoryId, payload.attributes, payload.publishedAt);
    await this.attributeProjection.upsertBatch(payload.categoryId, attributes);

    await this.idempotency.markProcessed(eventId);
  }

  public async handleCategoryUnpublished(
    eventId: string,
    payload: CategoryUnpublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.categoryProjection.delete(payload.categoryId);
    await this.attributeProjection.deleteByCategoryId(payload.categoryId);
    await this.idempotency.markProcessed(eventId);
  }
}

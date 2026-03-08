import { Inject, Injectable } from '@nestjs/common';

import type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';

import { projectCategory } from '../../../domain/read-models/category.read-model.js';
import {
  CategoryProjectionPort,
  IdempotencyPort,
} from '../../projection-ports.js';

/** Проецирует category.published / category.unpublished в PG. Атрибуты хранятся как JSONB внутри категории. */
@Injectable()
export class ProjectCategoryHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(CategoryProjectionPort) private readonly categoryProjection: CategoryProjectionPort,
  ) {}

  public async handleCategoryPublished(
    eventId: string,
    payload: CategoryPublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const category = projectCategory(payload);
    await this.categoryProjection.upsert(category);

    await this.idempotency.markProcessed(eventId);
  }

  public async handleCategoryUnpublished(
    eventId: string,
    payload: CategoryUnpublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.categoryProjection.delete(payload.categoryId);

    await this.idempotency.markProcessed(eventId);
  }
}

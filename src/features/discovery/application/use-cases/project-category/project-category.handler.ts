import { Inject, Injectable } from '@nestjs/common';

import { projectCategory } from '../../../domain/read-models/category.read-model.js';
import { CategoryAncestorLookupPort } from '../../ports.js';
import { CategoryProjectionPort, IdempotencyPort } from '../../projection-ports.js';
import type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';

/** Проецирует category.published / category.unpublished в PG. Атрибуты хранятся как JSONB внутри категории. */
@Injectable()
export class ProjectCategoryHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(CategoryProjectionPort) private readonly categoryProjection: CategoryProjectionPort,
    @Inject(CategoryAncestorLookupPort) private readonly ancestorLookup: CategoryAncestorLookupPort,
  ) {}

  public async handleCategoryPublished(
    eventId: string,
    payload: CategoryPublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const category = projectCategory(payload);
    await this.categoryProjection.upsert(category);
    this.ancestorLookup.clearCache();

    await this.idempotency.markProcessed(eventId);
  }

  public async handleCategoryUnpublished(
    eventId: string,
    payload: CategoryUnpublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.categoryProjection.delete(payload.categoryId);
    this.ancestorLookup.clearCache();

    await this.idempotency.markProcessed(eventId);
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { projectCategory } from '../../../domain/read-models/category.read-model.js';
import { CategoryAncestorLookupPort } from '../../ports.js';
import {
  CategoryProjectionPort,
  IdempotencyPort,
  ItemProjectionPort,
} from '../../projection-ports.js';
import { GorseSyncPort, MeilisearchSyncPort } from '../../sync-ports.js';
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
    @Inject(ItemProjectionPort) private readonly itemProjection: ItemProjectionPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
    @Inject(MeilisearchSyncPort) private readonly meilisearch: MeilisearchSyncPort,
  ) {}

  public async handleCategoryPublished(
    eventId: string,
    payload: CategoryPublishedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const category = projectCategory(payload);
    await this.categoryProjection.upsert(category);
    this.ancestorLookup.clearCache();

    if (payload.republished) {
      // Re-sync items этой категории: rootCategoryIds в Gorse и categoryIds-фасеты
      // в Meilisearch резолвились в момент item.published — после смены родителя
      // они устарели, а сами items не получают своего события.
      // Каскад на потомков не нужен: при изменении родителя CMS требует unpublish
      // (см. CategoryEntity.update), а unpublish каскадно валит всё поддерево —
      // последующий republish каждой категории несёт свежие ancestorIds в самом событии.
      const items = await this.itemProjection.findReadModelsByCategoryIds([payload.categoryId]);
      if (items.length > 0) {
        await Promise.all(items.map((item) => this.gorse.upsertItem(item)));
        await this.meilisearch.upsertItems(items);
      }
    }

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

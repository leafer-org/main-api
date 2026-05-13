import { Inject, Injectable } from '@nestjs/common';

import { IdempotencyPort, ItemProjectionPort } from '../../projection-ports.js';
import {
  CategorySearchSyncPort,
  GorseSyncPort,
  MeilisearchSyncPort,
} from '../../sync-ports.js';
import { CategoryDirectoryPort } from '@/kernel/application/ports/category-directory.js';
import type { CategoryId } from '@/kernel/domain/ids.js';

/**
 * Реакция discovery на тонкое событие `category.changed`:
 *  1) Меняем индекс suggestions в Meili (upsert/delete по `status`)
 *  2) Re-syncаем items в поддереве этой категории (closure + Meili + Gorse)
 *     — структурная цена смены родителя категории.
 *
 * Discovery не хранит проекции категорий (метаданные читаются через
 * CategoryDirectoryPort из cms write-side). Денормализация дерева живёт в
 * `discovery_item_categories` (closure: direct ∪ ancestors).
 */
@Injectable()
export class ProjectCategoryHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(ItemProjectionPort) private readonly itemProjection: ItemProjectionPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
    @Inject(MeilisearchSyncPort) private readonly meilisearch: MeilisearchSyncPort,
    @Inject(CategoryDirectoryPort) private readonly categoryDirectory: CategoryDirectoryPort,
    @Inject(CategorySearchSyncPort)
    private readonly categorySearchSync: CategorySearchSyncPort,
  ) {}

  public async handleCategoryChanged(eventId: string, categoryId: CategoryId): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    // Свежий read категории — отсюда же резолвим closure для items в поддереве.
    // Cache в адаптере мог быть прогрет старыми данными до события.
    this.categoryDirectory.clearCache();

    const view = await this.categoryDirectory.findById(categoryId);

    if (!view || view.status !== 'published') {
      await this.categorySearchSync.delete(categoryId);
    } else {
      await this.categorySearchSync.upsert({ categoryId: view.categoryId, name: view.name });
    }

    // Cascade: items в этой категории и поддереве должны переиндексироваться,
    // т.к. их closureCategoryIds зависит от ancestor-chain, который мог сместиться.
    const subtreeIds = await this.categoryDirectory.findDescendantIds(categoryId);
    if (subtreeIds.length > 0) {
      const items = await this.itemProjection.findReadModelsByCategoryIds(subtreeIds);
      if (items.length > 0) {
        for (const item of items) {
          if (item.category) {
            item.category.closureCategoryIds = await this.categoryDirectory.findAncestorClosure(
              item.category.categoryIds,
            );
          }
        }
        for (const item of items) await this.itemProjection.upsert(item);
        await Promise.all(items.map((item) => this.gorse.upsertItem(item)));
        await this.meilisearch.upsertItems(items);
      }
    }

    await this.idempotency.markProcessed(eventId);
  }
}

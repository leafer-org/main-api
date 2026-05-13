import { Inject, Injectable } from '@nestjs/common';

import {
  type ItemReadModel,
  projectItemFromState,
} from '../../../domain/read-models/item.read-model.js';
import { IdempotencyPort, ItemProjectionPort } from '../../projection-ports.js';
import { GorseSyncPort, MeilisearchSyncPort } from '../../sync-ports.js';
import { CategoryDirectoryPort } from '@/kernel/application/ports/category-directory.js';
import { ItemDirectoryPort } from '@/kernel/application/ports/item-directory.js';
import type { ItemId } from '@/kernel/domain/ids.js';

/**
 * Реакция discovery на тонкое событие `item.changed`:
 *  - Если item published — читаем свежий state через `ItemDirectoryPort`,
 *    мапим в read-model, обогащаем closure категорий и upsert'аем
 *    в discovery_items + Gorse + Meilisearch.
 *  - Если item не найден / удалён / снят с публикации — delete.
 *
 * TODO: DLQ при ошибке синхронизации Gorse/Meilisearch (exponential backoff).
 */
@Injectable()
export class ProjectItemHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(ItemProjectionPort) private readonly itemProjection: ItemProjectionPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
    @Inject(MeilisearchSyncPort) private readonly meilisearch: MeilisearchSyncPort,
    @Inject(CategoryDirectoryPort) private readonly categoryDirectory: CategoryDirectoryPort,
    @Inject(ItemDirectoryPort) private readonly itemDirectory: ItemDirectoryPort,
  ) {}

  public async handleItemChanged(eventId: string, itemId: ItemId): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    // Cache мог быть прогрет старым state'ом до события — сбрасываем.
    this.itemDirectory.clearCache();

    const view = await this.itemDirectory.findById(itemId);

    if (!view) {
      // Удалён / не опубликован — снимаем с проекций и индексов.
      await this.itemProjection.delete(itemId);
      await this.gorse.deleteItem(itemId);
      await this.meilisearch.deleteItem(itemId);
      await this.idempotency.markProcessed(eventId);
      return;
    }

    const readModel = projectItemFromState({
      itemId: view.itemId,
      typeId: view.typeId,
      widgets: view.widgets,
      publishedAt: view.publishedAt,
      updatedAt: view.updatedAt,
    });
    await this.enrichCategoryClosure(readModel);

    await this.itemProjection.upsert(readModel);
    await this.gorse.upsertItem(readModel);
    await this.meilisearch.upsertItem(readModel);

    await this.idempotency.markProcessed(eventId);
  }

  private async enrichCategoryClosure(item: ItemReadModel): Promise<void> {
    if (!item.category) return;
    item.category.closureCategoryIds = await this.categoryDirectory.findAncestorClosure(
      item.category.categoryIds,
    );
  }
}

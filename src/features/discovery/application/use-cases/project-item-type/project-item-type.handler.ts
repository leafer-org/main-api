import { Inject, Injectable } from '@nestjs/common';

import { IdempotencyPort } from '../../projection-ports.js';
import { ItemTypeSearchSyncPort } from '../../sync-ports.js';
import { ItemTypeDirectoryPort } from '@/kernel/application/ports/item-type-directory.js';
import type { TypeId } from '@/kernel/domain/ids.js';

/**
 * Реакция discovery на тонкое событие `item-type.changed`: апдейт search-индекса
 * suggestions в Meili. Метаданные item-type'ов больше не хранятся в discovery —
 * читаются через `ItemTypeDirectoryPort` (cms write-side) при необходимости.
 */
@Injectable()
export class ProjectItemTypeHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(ItemTypeDirectoryPort) private readonly itemTypeDirectory: ItemTypeDirectoryPort,
    @Inject(ItemTypeSearchSyncPort)
    private readonly itemTypeSearchSync: ItemTypeSearchSyncPort,
  ) {}

  public async handleItemTypeChanged(eventId: string, typeId: TypeId): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const view = await this.itemTypeDirectory.findById(typeId);
    if (!view) {
      await this.itemTypeSearchSync.delete(typeId);
    } else {
      await this.itemTypeSearchSync.upsert({ typeId: view.typeId, name: view.name });
    }

    await this.idempotency.markProcessed(eventId);
  }
}

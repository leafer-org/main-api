import { Inject, Injectable } from '@nestjs/common';

import { ItemQueryPort } from '../../ports.js';
import {
  IdempotencyPort,
  ItemProjectionPort,
  OwnerProjectionPort,
} from '../../projection-ports.js';
import {
  GorseSyncPort,
  MeilisearchSyncPort,
  OrganizationSearchSyncPort,
} from '../../sync-ports.js';
import { OrganizationDirectoryPort } from '@/kernel/application/ports/organization-directory.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

/**
 * Реакция discovery на тонкое событие `organization.changed`:
 *  - Если организация published — upsert в `discovery_owners` (denormalized name/avatar/team).
 *    На conflict рейтинг/reviewCount сохраняются (cascade из review.created).
 *    Каскадно обновляется `ownerName`/`ownerAvatarId` у её items + переиндексация в Meili.
 *  - Если организация удалена / не-published — delete owner + каскадное удаление items.
 *
 * Свежий state читается через `OrganizationDirectoryPort` (write-side в feature
 * `organization`). Тонкое событие — только сигнал «что-то изменилось».
 */
@Injectable()
export class ProjectOwnerHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(OwnerProjectionPort) private readonly ownerProjection: OwnerProjectionPort,
    @Inject(ItemProjectionPort) private readonly itemProjection: ItemProjectionPort,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
    @Inject(MeilisearchSyncPort) private readonly meilisearch: MeilisearchSyncPort,
    @Inject(OrganizationDirectoryPort)
    private readonly organizationDirectory: OrganizationDirectoryPort,
    @Inject(OrganizationSearchSyncPort)
    private readonly organizationSearchSync: OrganizationSearchSyncPort,
  ) {}

  public async handleOrganizationChanged(
    eventId: string,
    organizationId: OrganizationId,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    // Cache мог быть прогрет старым state'ом до события — сбрасываем.
    this.organizationDirectory.clearCache();

    const view = await this.organizationDirectory.findById(organizationId);

    if (!view) {
      // Организация удалена / не опубликована — удаляем owner, search-индекс
      // и каскадно items.
      await this.organizationSearchSync.delete(organizationId);
      await this.ownerProjection.delete(organizationId);
      const affectedItemIds = await this.itemProjection.deleteByOrganizationId(organizationId);
      await Promise.all(
        affectedItemIds.map(async (itemId) => {
          await this.gorse.deleteItem(itemId);
          await this.meilisearch.deleteItem(itemId);
        }),
      );
      await this.idempotency.markProcessed(eventId);
      return;
    }

    // Meili search-suggestions: имя организации (для autocomplete).
    await this.organizationSearchSync.upsert({
      organizationId: view.organizationId,
      name: view.name,
    });

    // upsert: на конфликте обновляются только denormalized поля,
    // rating/reviewCount остаются в проекции нетронутыми.
    await this.ownerProjection.upsert({
      ownerId: view.organizationId,
      name: view.name,
      description: view.description,
      avatarId: view.avatarId,
      media: view.media,
      contacts: view.contacts,
      team: view.team,
      rating: null,
      reviewCount: 0,
      updatedAt: view.updatedAt,
    });

    // Каскад denormalized полей в discovery_items + переиндексация в Meili.
    const affectedItemIds = await this.itemProjection.updateOwnerData(view.organizationId, {
      name: view.name,
      avatarId: view.avatarId,
    });
    if (affectedItemIds.length > 0) {
      const items = await this.itemQuery.findByIds(affectedItemIds);
      await this.meilisearch.upsertItems(items);
    }

    await this.idempotency.markProcessed(eventId);
  }
}

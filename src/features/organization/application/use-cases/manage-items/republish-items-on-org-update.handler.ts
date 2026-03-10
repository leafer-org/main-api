import { Inject, Injectable } from '@nestjs/common';

import { ItemEventPublisher, ItemRepository, OrganizationRepository } from '../../ports.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';
import type { InfoModerationApprovedEvent } from '../../../domain/aggregates/organization/events.js';

@Injectable()
export class RepublishItemsOnOrgUpdateHandler {
  public constructor(
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(ItemEventPublisher) private readonly eventPublisher: ItemEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
  ) {}

  public async handle(event: InfoModerationApprovedEvent & { organizationId: OrganizationId }): Promise<void> {
    await this.txHost.startTransaction(async (tx) => {
      const org = await this.organizationRepository.findById(tx, event.organizationId);
      const infoPublication = org?.infoPublication
      if (!infoPublication) return;

      const publishedItems = await this.itemRepository.findPublishedByOrganizationId(
        tx,
        event.organizationId,
      );

      for (const item of publishedItems) {
        if (!item.publication) continue;

        // Update OwnerWidget with new organization info
        const updatedWidgets = item.publication.widgets.map((w) => {
          if (w.type === 'owner') {
            return {
              ...w,
              name: infoPublication.name,
              avatarId: infoPublication.avatarId,
            };
          }
          return w;
        });

        const eventId = crypto.randomUUID();
        await this.eventPublisher.publishItemPublished(tx, {
          id: eventId,
          type: 'item.published',
          itemId: item.itemId,
          typeId: item.typeId,
          organizationId: item.organizationId,
          widgets: updatedWidgets,
          republished: true,
          publishedAt: event.publishedAt,
        });
      }
    });
  }
}

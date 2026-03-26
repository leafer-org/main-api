import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { ItemNotFoundError } from '../../../domain/aggregates/item/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { ItemEventPublisher, ItemRepository, ModerationResultPublisher } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId } from '@/kernel/domain/ids.js';

@Injectable()
export class ApproveItemModerationInteractor {
  public constructor(
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(ItemEventPublisher) private readonly eventPublisher: ItemEventPublisher,
    @Inject(ModerationResultPublisher) private readonly moderationResultPublisher: ModerationResultPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { itemId: ItemId }) {
    const auth = await this.permissionCheck.mustCanModerate();
    if (isLeft(auth)) return auth;

    const now = this.clock.now();
    const eventId = crypto.randomUUID();

    return this.txHost.startTransaction(async (tx) => {
      const item = await this.itemRepository.findById(tx, command.itemId);
      if (!item) return Left(new ItemNotFoundError());

      const result = ItemEntity.approveModeration(item, {
        type: 'ApproveItemModeration',
        eventId,
        now,
      });
      if (isLeft(result)) return result;

      const { state: newState, event: domainEvent } = result.value;
      await this.itemRepository.save(tx, newState);

      await this.eventPublisher.publishItemPublished(tx, {
        id: eventId,
        type: 'item.published',
        itemId: domainEvent.itemId,
        typeId: domainEvent.typeId,
        organizationId: domainEvent.organizationId,
        widgets: domainEvent.widgets,
        republished: domainEvent.republished,
        publishedAt: domainEvent.publishedAt,
      });

      await this.moderationResultPublisher.publish(tx, {
        id: crypto.randomUUID(),
        type: 'moderation.approved',
        entityType: 'item',
        entityId: command.itemId as string,
      });

      return Right(undefined);
    });
  }
}

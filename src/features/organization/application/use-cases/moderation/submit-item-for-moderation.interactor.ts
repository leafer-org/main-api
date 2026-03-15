import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { ItemNotFoundError } from '../../../domain/aggregates/item/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { ItemEventPublisher, ItemRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class SubmitItemForModerationInteractor {
  public constructor(
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(ItemEventPublisher) private readonly eventPublisher: ItemEventPublisher,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    organizationId: OrganizationId;
    userId: UserId;
    itemId: ItemId;
  }) {
    const auth = await this.permissionCheck.mustHavePermission(
      command.organizationId,
      command.userId,
      'publish_items',
    );
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const item = await this.itemRepository.findById(tx, command.itemId);
      if (!item) return Left(new ItemNotFoundError());

      const result = ItemEntity.submitForModeration(item, {
        type: 'SubmitItemForModeration',
        now,
      });
      if (isLeft(result)) return result;

      const { state: newState, event } = result.value;
      await this.itemRepository.save(tx, newState);
      await this.eventPublisher.publishModerationRequested(tx, {
        id: crypto.randomUUID(),
        type: 'item.moderation-requested',
        itemId: event.itemId,
        organizationId: event.organizationId,
        typeId: event.typeId,
        widgets: event.widgets,
        submittedAt: event.submittedAt,
      });

      return Right(undefined);
    });
  }
}

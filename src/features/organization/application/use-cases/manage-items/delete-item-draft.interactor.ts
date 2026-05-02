import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { ItemNotFoundError } from '../../../domain/aggregates/item/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { ItemRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId, OrganizationId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class DeleteItemDraftInteractor {
  public constructor(
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
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
      'edit_items',
      { globalBypass: Permission.OrganizationItemEdit },
    );
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const item = await this.itemRepository.findById(tx, command.itemId);
      if (!item) return Left(new ItemNotFoundError());

      const result = ItemEntity.deleteDraft(item, {
        type: 'DeleteDraft',
        now,
      });
      if (isLeft(result)) return result;

      if (result.value.state === null) {
        await this.itemRepository.delete(tx, command.itemId);
      } else {
        await this.itemRepository.save(tx, result.value.state);
      }

      return Right(undefined);
    });
  }
}

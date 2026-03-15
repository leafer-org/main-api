import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { ItemNotFoundError } from '../../../domain/aggregates/item/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { ItemRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId } from '@/kernel/domain/ids.js';

@Injectable()
export class RejectItemModerationInteractor {
  public constructor(
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { itemId: ItemId }) {
    const auth = await this.permissionCheck.mustCanModerate();
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const item = await this.itemRepository.findById(tx, command.itemId);
      if (!item) return Left(new ItemNotFoundError());

      const result = ItemEntity.rejectModeration(item, {
        type: 'RejectItemModeration',
        now,
      });
      if (isLeft(result)) return result;

      await this.itemRepository.save(tx, result.value.state);

      return Right(undefined);
    });
  }
}

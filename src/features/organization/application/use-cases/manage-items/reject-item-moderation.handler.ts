import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { ItemRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId } from '@/kernel/domain/ids.js';

@Injectable()
export class RejectItemModerationHandler {
  public constructor(
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async handle(event: { itemId: ItemId }): Promise<void> {
    const now = this.clock.now();

    await this.txHost.startTransaction(async (tx) => {
      const item = await this.itemRepository.findById(tx, event.itemId);
      if (!item) return;

      const result = ItemEntity.rejectModeration(item, {
        type: 'RejectItemModeration',
        now,
      });
      if (isLeft(result)) return;

      await this.itemRepository.save(tx, result.value.state);
    });
  }
}

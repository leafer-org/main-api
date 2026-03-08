import { Injectable, Logger } from '@nestjs/common';

import { GorseSyncPort } from '../../application/sync-ports.js';
import type { ItemReadModel } from '../../domain/read-models/item.read-model.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class GorseSyncStub implements GorseSyncPort {
  private readonly logger = new Logger(GorseSyncStub.name);

  public async upsertItem(_item: ItemReadModel): Promise<void> {
    this.logger.debug('GorseSyncStub.upsertItem called (no-op)');
  }

  public async deleteItem(_itemId: ItemId): Promise<void> {
    this.logger.debug('GorseSyncStub.deleteItem called (no-op)');
  }

  public async sendFeedback(
    _userId: UserId,
    _itemId: ItemId,
    _feedbackType: string,
    _timestamp: Date,
  ): Promise<void> {
    this.logger.debug('GorseSyncStub.sendFeedback called (no-op)');
  }

  public async deleteFeedback(
    _userId: UserId,
    _itemId: ItemId,
    _feedbackType: string,
  ): Promise<void> {
    this.logger.debug('GorseSyncStub.deleteFeedback called (no-op)');
  }
}

import { Injectable, Logger } from '@nestjs/common';

import { RecommendationService } from '../../application/ports.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

@Injectable()
export class RecommendationStub implements RecommendationService {
  private readonly logger = new Logger(RecommendationStub.name);

  public async recommend(_params: {
    userId?: UserId;
    cityId: string;
    ageGroup: AgeGroup;
    offset: number;
    limit: number;
  }): Promise<ItemId[]> {
    this.logger.debug('RecommendationStub.recommend called — returning []');
    return [];
  }

  public async rank(params: { userId?: UserId; itemIds: ItemId[] }): Promise<ItemId[]> {
    this.logger.debug('RecommendationStub.rank called — returning itemIds as-is');
    return params.itemIds;
  }
}

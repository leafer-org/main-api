import { Inject, Injectable } from '@nestjs/common';

import { RecommendationService } from '../../application/ports.js';
import { GorseClient } from '@/infra/lib/nest-gorse/index.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';
import { ItemId as ItemIdFactory } from '@/kernel/domain/ids.js';

@Injectable()
export class GorseRecommendationAdapter implements RecommendationService {
  public constructor(@Inject(GorseClient) private readonly client: GorseClient) {}

  public async recommend(params: {
    userId?: UserId;
    category: string;
    offset: number;
    limit: number;
  }): Promise<ItemId[]> {
    if (params.userId) {
      const qs = new URLSearchParams();
      qs.set('n', String(params.limit));
      qs.set('offset', String(params.offset));
      qs.set('category', params.category);

      const ids = await this.client.getRecommend(String(params.userId), qs);
      return ids.map((id) => ItemIdFactory.raw(id));
    }

    const qs = new URLSearchParams();
    qs.set('n', String(params.limit));
    qs.set('offset', String(params.offset));

    const results = await this.client.getPopular(qs, params.category);
    return results.map((r) => ItemIdFactory.raw(r.Id));
  }
}

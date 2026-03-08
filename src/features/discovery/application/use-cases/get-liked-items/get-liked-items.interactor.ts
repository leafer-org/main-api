import { Inject, Injectable } from '@nestjs/common';

import { Right } from '@/infra/lib/box.js';
import type { UserId } from '@/kernel/domain/ids.js';

import { LikedItemsQueryPort } from '../../ports.js';

/** Лайкнутые товары пользователя. Сортировка по likedAt DESC, cursor-based пагинация, поиск по title (ILIKE). */
@Injectable()
export class GetLikedItemsInteractor {
  public constructor(
    @Inject(LikedItemsQueryPort) private readonly likedItemsQuery: LikedItemsQueryPort,
  ) {}

  public async execute(query: { userId: UserId; search?: string; cursor?: string; limit: number }) {
    const result = await this.likedItemsQuery.findLikedItems(query);
    return Right(result);
  }
}

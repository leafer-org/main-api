import { Inject, Injectable } from '@nestjs/common';

import { toDetailView } from '../../../domain/mappers/item-detail-view.mapper.js';
import { ItemQueryPort } from '../../ports.js';
import { ItemNotFoundError } from './errors.js';
import { Left, Right } from '@/infra/lib/box.js';
import type { ItemId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetItemDetailInteractor {
  public constructor(
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
  ) {}

  public async execute(query: { itemId: ItemId }) {
    const item = await this.itemQuery.findById(query.itemId);
    if (!item) return Left(new ItemNotFoundError());

    return Right(toDetailView(item));
  }
}

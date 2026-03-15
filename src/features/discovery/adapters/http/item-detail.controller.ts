import { Controller, Get, Param } from '@nestjs/common';

import { GetItemDetailInteractor } from '../../application/use-cases/view-item/get-item-detail.interactor.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { ItemId } from '@/kernel/domain/ids.js';

@Public()
@Controller('items')
export class ItemDetailController {
  public constructor(private readonly getItemDetail: GetItemDetailInteractor) {}

  @Get(':itemId')
  public async detail(
    @Param('itemId') itemId: string,
  ): Promise<PublicResponse['getDiscoveryItemDetail']> {
    const result = await this.getItemDetail.execute({ itemId: ItemId.raw(itemId) });

    if (isLeft(result)) {
      throw domainToHttpError(result.error.toResponse());
    }

    return {
      ...result.value,
      widgets: result.value.widgets as PublicResponse['getDiscoveryItemDetail']['widgets'],
      publishedAt: result.value.publishedAt.toISOString(),
    };
  }
}

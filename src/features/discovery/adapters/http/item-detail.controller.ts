import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';

import { GetItemDetailInteractor } from '../../application/use-cases/view-item/get-item-detail.interactor.js';
import { avatarImageProxy, detailImageOptions } from './image-proxy-options.js';
import { resolveWidgetMedia } from './resolve-widget-media.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { ItemId } from '@/kernel/domain/ids.js';

@Public()
@Controller('items')
export class ItemDetailController {
  public constructor(
    private readonly getItemDetail: GetItemDetailInteractor,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  @Get(':itemId')
  public async detail(
    @Req() req: Request,
    @Param('itemId') itemId: string,
  ): Promise<PublicResponse['getDiscoveryItemDetail']> {
    const result = await this.getItemDetail.execute({ itemId: ItemId.raw(itemId) });

    if (isLeft(result)) {
      throw domainToHttpError(result.error.toResponse());
    }

    const loader = this.mediaService.createMediaLoader(detailImageOptions(req));
    const resolvedWidgets = await resolveWidgetMedia(result.value.widgets, loader, avatarImageProxy(req));

    return {
      ...result.value,
      widgets: resolvedWidgets,
      publishedAt: result.value.publishedAt.toISOString(),
    };
  }
}

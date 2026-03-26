import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { SearchItemsInteractor } from '../../application/use-cases/search/search-items.interactor.js';
import { avatarImageProxy, cardImageOptions } from './image-proxy-options.js';
import { resolveItemListMedia } from './resolve-item-media.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { CategoryId, TypeId } from '@/kernel/domain/ids.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';

@Public()
@Controller('search')
export class SearchController {
  public constructor(
    private readonly searchItems: SearchItemsInteractor,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  @Get()
  public async search(
    @Req() req: Request,
    @Query('query') query: PublicQuery['searchItems']['query'],
    @Query('cityId') cityId: PublicQuery['searchItems']['cityId'],
    @Query('ageGroup') ageGroup?: PublicQuery['searchItems']['ageGroup'],
    @Query('categoryIds') categoryIds?: PublicQuery['searchItems']['categoryIds'],
    @Query('typeIds') typeIds?: PublicQuery['searchItems']['typeIds'],
    @Query('priceMin') priceMin?: PublicQuery['searchItems']['priceMin'],
    @Query('priceMax') priceMax?: PublicQuery['searchItems']['priceMax'],
    @Query('cursor') cursor?: PublicQuery['searchItems']['cursor'],
    @Query('limit') limit?: PublicQuery['searchItems']['limit'],
  ): Promise<PublicResponse['searchItems']> {
    const result = await this.searchItems.execute({
      query,
      cityId,
      ageGroup: AgeGroupOption.restore(ageGroup ?? 'adults'),
      filters: {
        categoryIds: categoryIds
          ? categoryIds.split(',').map((s) => CategoryId.raw(s.trim()))
          : undefined,
        typeIds: typeIds ? typeIds.split(',').map((s) => TypeId.raw(s.trim())) : undefined,
        priceRange:
          priceMin !== null || priceMax !== null
            ? {
                min: priceMin !== null ? Number(priceMin) : undefined,
                max: priceMax !== null ? Number(priceMax) : undefined,
              }
            : undefined,
      },
      cursor: cursor ?? undefined,
      limit: Number(limit ?? 20),
    });

    const loader = this.mediaService.createMediaLoader(cardImageOptions(req));
    const resolvedItems = await resolveItemListMedia(result.value.items, loader, avatarImageProxy(req));

    return {
      ...result.value,
      items: resolvedItems,
    };
  }
}

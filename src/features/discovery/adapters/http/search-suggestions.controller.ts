import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { GetSearchSuggestionsInteractor } from '../../application/use-cases/search/get-search-suggestions.interactor.js';
import { avatarImageProxy, cardImageOptions } from './image-proxy-options.js';
import { resolveItemListMedia } from './resolve-item-media.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Public()
@Controller('search')
export class SearchSuggestionsController {
  public constructor(
    private readonly getSuggestions: GetSearchSuggestionsInteractor,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  @Get('suggestions')
  public async suggestions(
    @Req() req: Request,
    @Query('cityId') cityId: PublicQuery['searchSuggestions']['cityId'],
    @Query('query') query?: PublicQuery['searchSuggestions']['query'],
    @Query('ageGroup') ageGroup?: PublicQuery['searchSuggestions']['ageGroup'],
  ): Promise<PublicResponse['searchSuggestions']> {
    const result = await this.getSuggestions.execute({
      query: query ?? '',
      cityId,
      ageGroup: AgeGroupOption.restore(ageGroup ?? 'adults'),
    });

    const loader = this.mediaService.createMediaLoader(cardImageOptions(req));
    const avatarProxy = avatarImageProxy(req);
    const [resolvedItems, organizations] = await Promise.all([
      resolveItemListMedia(result.value.items, loader, avatarProxy),
      Promise.all(
        result.value.organizations.map(async (o) => ({
          organizationId: o.organizationId as string,
          name: o.name,
          avatarId: o.avatarId as string | null,
          avatarUrl: await loader.getImageUrl(o.avatarId as MediaId | null, avatarProxy),
        })),
      ),
    ]);

    return {
      categories: result.value.categories.map((c) => ({
        categoryId: c.categoryId as string,
        name: c.name,
      })),
      itemTypes: result.value.itemTypes.map((t) => ({
        typeId: t.typeId as string,
        name: t.name,
        parentCategoryId: t.parentCategoryId as string | null,
      })),
      organizations,
      items: resolvedItems,
      popularQueries: result.value.popularQueries,
    };
  }
}

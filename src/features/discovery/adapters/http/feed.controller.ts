import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { GetFeedInteractor } from '../../application/use-cases/browse-feed/get-feed.interactor.js';
import { avatarImageProxy, cardImageOptions } from './image-proxy-options.js';
import { resolveItemListMedia } from './resolve-item-media.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';

@Public()
@Controller('feed')
export class FeedController {
  public constructor(
    private readonly getFeed: GetFeedInteractor,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  @Get()
  public async list(
    @Req() req: Request,
    @Query('cityId') cityId: PublicQuery['getFeed']['cityId'],
    @Query('ageGroup') ageGroup?: PublicQuery['getFeed']['ageGroup'],
    @Query('cursor') cursor?: PublicQuery['getFeed']['cursor'],
    @Query('limit') limit?: PublicQuery['getFeed']['limit'],
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ): Promise<PublicResponse['getFeed']> {
    const coordinates =
      lat !== undefined && lng !== undefined ? { lat: Number(lat), lng: Number(lng) } : undefined;

    const result = await this.getFeed.execute({
      cityId,
      coordinates,
      ageGroup: AgeGroupOption.restore(ageGroup ?? 'adults'),
      cursor: cursor ?? undefined,
      limit: Number(limit ?? 20),
    });

    const loader = this.mediaService.createMediaLoader(cardImageOptions(req));
    const resolvedItems = await resolveItemListMedia(result.value.items, loader, avatarImageProxy(req));

    return {
      items: resolvedItems,
      nextCursor: result.value.nextCursor,
    };
  }
}

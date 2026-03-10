import { Controller, Get, Query } from '@nestjs/common';

import { GetFeedInteractor } from '../../application/use-cases/browse-feed/get-feed.interactor.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

@Public()
@Controller('feed')
export class FeedController {
  public constructor(private readonly getFeed: GetFeedInteractor) {}

  @Get()
  public async list(
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
      ageGroup: (ageGroup ?? 'adults') as AgeGroup,
      cursor: cursor ?? undefined,
      limit: Number(limit ?? 20),
    });

    return result.value as PublicResponse['getFeed'];
  }
}

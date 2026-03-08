import { Controller, Get, Query } from '@nestjs/common';

import { SearchItemsInteractor } from '../../application/use-cases/search/search-items.interactor.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { CategoryId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

@Public()
@Controller('search')
export class SearchController {
  public constructor(private readonly searchItems: SearchItemsInteractor) {}

  @Get()
  public async search(
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
      ageGroup: (ageGroup ?? 'adults') as AgeGroup,
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

    return result.value as PublicResponse['searchItems'];
  }
}

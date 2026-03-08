import { Controller, Get, Param, Query } from '@nestjs/common';

import { GetCategoryItemsInteractor } from '../../application/use-cases/get-category-items/get-category-items.interactor.js';
import type { SortOption } from '../../application/use-cases/get-category-items/types.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { CategoryId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

@Controller('categories')
export class CategoryItemsController {
  public constructor(private readonly getCategoryItems: GetCategoryItemsInteractor) {}

  @Public()
  @Get(':id/items')
  public async getItems(
    @Param('id') id: string,
    @Query('sort') sort?: PublicQuery['getCategoryItems']['sort'],
    @Query('cursor') cursor?: PublicQuery['getCategoryItems']['cursor'],
    @Query('limit') limit?: PublicQuery['getCategoryItems']['limit'],
    @Query('cityId') cityId?: PublicQuery['getCategoryItems']['cityId'],
    @Query('ageGroup') ageGroup?: PublicQuery['getCategoryItems']['ageGroup'],
    @Query('typeIds') typeIds?: PublicQuery['getCategoryItems']['typeIds'],
    @Query('priceMin') priceMin?: PublicQuery['getCategoryItems']['priceMin'],
    @Query('priceMax') priceMax?: PublicQuery['getCategoryItems']['priceMax'],
    @Query('minRating') minRating?: PublicQuery['getCategoryItems']['minRating'],
  ): Promise<PublicResponse['getCategoryItems']> {
    const result = await this.getCategoryItems.execute({
      categoryId: CategoryId.raw(id),
      sort: (sort ?? 'personal') as SortOption,
      cityId: cityId ?? '',
      ageGroup: (ageGroup ?? 'adults') as AgeGroup,
      filters: {
        typeIds: typeIds ? typeIds.split(',').map((t) => TypeId.raw(t.trim())) : undefined,
        priceRange:
          priceMin !== null || priceMax !== null
            ? {
                min: priceMin !== null ? Number(priceMin) : undefined,
                max: priceMax !== null ? Number(priceMax) : undefined,
              }
            : undefined,
        minRating: minRating !== null ? Number(minRating) : undefined,
      },
      cursor: cursor ?? undefined,
      limit: Number(limit ?? 20),
    });

    return result.value as PublicResponse['getCategoryItems'];
  }
}

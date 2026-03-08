import { Controller, Get, Param, Query } from '@nestjs/common';

import { GetCategoryFiltersInteractor } from '../../application/use-cases/get-category-filters/get-category-filters.interactor.js';
import { GetCategoryListInteractor } from '../../application/use-cases/get-category-list/get-category-list.interactor.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { CategoryId } from '@/kernel/domain/ids.js';

@Controller('categories')
export class CategoriesController {
  public constructor(
    private readonly getCategoryList: GetCategoryListInteractor,
    private readonly getCategoryFilters: GetCategoryFiltersInteractor,
  ) {}

  @Public()
  @Get()
  public async list(
    @Query('parentCategoryId') parentCategoryId?: PublicQuery['getCategories']['parentCategoryId'],
  ): Promise<PublicResponse['getCategories']> {
    const result = await this.getCategoryList.execute({
      parentCategoryId: parentCategoryId ? CategoryId.raw(parentCategoryId) : null,
    });
    return result.value as PublicResponse['getCategories'];
  }

  @Public()
  @Get(':id/filters')
  public async getFilters(@Param('id') id: string): Promise<PublicResponse['getCategoryFilters']> {
    const result = await this.getCategoryFilters.execute({
      categoryId: CategoryId.raw(id),
    });

    if (isLeft(result)) {
      throw domainToHttpError(result.error.toResponse());
    }

    return result.value as PublicResponse['getCategoryFilters'];
  }
}

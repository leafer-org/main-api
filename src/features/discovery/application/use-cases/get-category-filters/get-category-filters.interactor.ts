import { Inject, Injectable } from '@nestjs/common';

import { Left, Right } from '@/infra/lib/box.js';
import type { CategoryId } from '@/kernel/domain/ids.js';

import { CategoryFiltersQueryPort } from '../../ports.js';
import { CategoryNotFoundError } from './errors.js';

@Injectable()
export class GetCategoryFiltersInteractor {
  public constructor(
    @Inject(CategoryFiltersQueryPort)
    private readonly categoryFiltersQuery: CategoryFiltersQueryPort,
  ) {}

  public async execute(query: { categoryId: CategoryId }) {
    const filters = await this.categoryFiltersQuery.findByCategoryId(query.categoryId);
    if (!filters) return Left(new CategoryNotFoundError());
    return Right(filters);
  }
}

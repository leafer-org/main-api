import { Inject, Injectable } from '@nestjs/common';

import type { CategoryFiltersReadModel } from '../../../domain/read-models/category-filters.read-model.js';
import { CategoryFiltersQueryPort } from '../../ports.js';
import { CategoryNotFoundError } from './errors.js';
import { Left, Right } from '@/infra/lib/box.js';
import type { CategoryId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetCategoryFiltersInteractor {
  public constructor(
    @Inject(CategoryFiltersQueryPort)
    private readonly categoryFiltersQuery: CategoryFiltersQueryPort,
  ) {}

  public async execute(query: { categoryId: CategoryId }) {
    const category = await this.categoryFiltersQuery.findById(query.categoryId);
    if (!category) return Left(new CategoryNotFoundError());

    const attributeFilters = category.attributes.map((a) => ({
      attributeId: a.attributeId,
      name: a.name,
      schema: a.schema,
    }));

    const typeFilters =
      category.allowedTypeIds.length > 0
        ? await this.categoryFiltersQuery.findTypesByIds(category.allowedTypeIds)
        : [];

    // TODO: commonFilters захардкожены, нужно определять динамически на основе данных категории
    const filters: CategoryFiltersReadModel = {
      categoryId: query.categoryId,
      attributeFilters,
      typeFilters,
      commonFilters: {
        hasPriceRange: true,
        hasRating: true,
        hasLocation: true,
        hasSchedule: true,
        hasEventDateTime: true,
      },
    };

    return Right(filters);
  }
}

import { Inject, Injectable } from '@nestjs/common';

import type { CategoryFiltersReadModel } from '../../../domain/read-models/category-filters.read-model.js';
import { CategoryNotFoundError } from './errors.js';
import { Left, Right } from '@/infra/lib/box.js';
import { CategoryDirectoryPort } from '@/kernel/application/ports/category-directory.js';
import { ItemTypeDirectoryPort } from '@/kernel/application/ports/item-type-directory.js';
import type { CategoryId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetCategoryFiltersInteractor {
  public constructor(
    @Inject(CategoryDirectoryPort)
    private readonly categoryDirectory: CategoryDirectoryPort,
    @Inject(ItemTypeDirectoryPort)
    private readonly itemTypeDirectory: ItemTypeDirectoryPort,
  ) {}

  public async execute(query: { categoryId: CategoryId }) {
    const category = await this.categoryDirectory.findById(query.categoryId);
    if (!category) return Left(new CategoryNotFoundError());

    const attributeFilters = category.attributes.map((a) => ({
      attributeId: a.attributeId,
      name: a.name,
      schema: a.schema,
    }));

    const typeFilters =
      category.allowedTypeIds.length > 0
        ? (await this.itemTypeDirectory.findByIds(category.allowedTypeIds)).map((t) => ({
            typeId: t.typeId,
            name: t.name,
          }))
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

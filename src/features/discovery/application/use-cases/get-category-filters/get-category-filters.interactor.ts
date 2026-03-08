import { Inject, Injectable } from '@nestjs/common';

import type { CategoryFiltersReadModel } from '../../../domain/read-models/category-filters.read-model.js';
import { CategoryFiltersQueryPort, type CategoryWithAttributes } from '../../ports.js';
import { CategoryNotFoundError } from './errors.js';
import { Left, Right } from '@/infra/lib/box.js';
import type { AttributeId, CategoryId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

@Injectable()
export class GetCategoryFiltersInteractor {
  public constructor(
    @Inject(CategoryFiltersQueryPort)
    private readonly categoryFiltersQuery: CategoryFiltersQueryPort,
  ) {}

  public async execute(query: { categoryId: CategoryId }) {
    const result = await this.categoryFiltersQuery.findWithAncestors(query.categoryId);
    if (!result) return Left(new CategoryNotFoundError());

    const { category, ancestors } = result;

    const attributeFilters = this.mergeAttributes(category, ancestors);

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

  private mergeAttributes(
    category: CategoryWithAttributes,
    ancestors: CategoryWithAttributes[],
  ): { attributeId: AttributeId; name: string; schema: AttributeSchema }[] {
    const seen = new Set<string>();
    const merged: { attributeId: AttributeId; name: string; schema: AttributeSchema }[] = [];

    for (const attr of category.attributes) {
      seen.add(attr.attributeId as string);
      merged.push({
        attributeId: attr.attributeId,
        name: attr.name,
        schema: attr.schema,
      });
    }

    for (const ancestor of ancestors) {
      for (const attr of ancestor.attributes) {
        if (!seen.has(attr.attributeId as string)) {
          seen.add(attr.attributeId as string);
          merged.push({
            attributeId: attr.attributeId,
            name: attr.name,
            schema: attr.schema,
          });
        }
      }
    }

    return merged;
  }
}

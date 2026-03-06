import { Inject, Injectable } from '@nestjs/common';

import { Right } from '@/infra/lib/box.js';
import type { CategoryId } from '@/kernel/domain/ids.js';

import { CategoryListQueryPort } from '../../ports.js';

@Injectable()
export class GetCategoryListInteractor {
  public constructor(
    @Inject(CategoryListQueryPort) private readonly categoryListQuery: CategoryListQueryPort,
  ) {}

  public async execute(query: { parentCategoryId: CategoryId | null }) {
    const categories = await this.categoryListQuery.findByParentId(query.parentCategoryId);
    return Right(categories);
  }
}

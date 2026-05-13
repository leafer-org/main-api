import { Inject, Injectable } from '@nestjs/common';

import type { CategoryListReadModel } from '../../../domain/read-models/category-list.read-model.js';
import { Right } from '@/infra/lib/box.js';
import { CategoryDirectoryPort } from '@/kernel/application/ports/category-directory.js';
import type { CategoryId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetCategoryListInteractor {
  public constructor(
    @Inject(CategoryDirectoryPort) private readonly categoryDirectory: CategoryDirectoryPort,
  ) {}

  public async execute(query: { parentCategoryId: CategoryId | null }) {
    const views = await this.categoryDirectory.findPublishedByParentId(query.parentCategoryId);
    const result: CategoryListReadModel[] = views.map((v) => ({
      categoryId: v.categoryId,
      name: v.name,
      iconId: v.iconId,
    }));
    return Right(result);
  }
}

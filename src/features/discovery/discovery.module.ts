import { Module } from '@nestjs/common';

import { Clock, SystemClock } from '@/infra/lib/clock.js';

import { GetCategoryFiltersInteractor } from './application/use-cases/get-category-filters/get-category-filters.interactor.js';
import { GetCategoryItemsInteractor } from './application/use-cases/get-category-items/get-category-items.interactor.js';
import { GetCategoryListInteractor } from './application/use-cases/get-category-list/get-category-list.interactor.js';
import { GetFeedInteractor } from './application/use-cases/get-feed/get-feed.interactor.js';
import { GetLikedItemsInteractor } from './application/use-cases/get-liked-items/get-liked-items.interactor.js';
import { ProjectCategoryHandler } from './application/use-cases/project-category/project-category.handler.js';
import { ProjectInteractionHandler } from './application/use-cases/project-interaction/project-interaction.handler.js';
import { ProjectItemHandler } from './application/use-cases/project-item/project-item.handler.js';
import { ProjectItemTypeHandler } from './application/use-cases/project-item-type/project-item-type.handler.js';
import { ProjectOwnerHandler } from './application/use-cases/project-owner/project-owner.handler.js';
import { ProjectReviewHandler } from './application/use-cases/project-review/project-review.handler.js';
import { SearchItemsInteractor } from './application/use-cases/search-items/search-items.interactor.js';
import { PostRankingService } from './domain/services/post-ranking.service.js';

@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    PostRankingService,
    GetFeedInteractor,
    GetCategoryItemsInteractor,
    GetCategoryFiltersInteractor,
    GetCategoryListInteractor,
    SearchItemsInteractor,
    GetLikedItemsInteractor,
    ProjectItemHandler,
    ProjectCategoryHandler,
    ProjectItemTypeHandler,
    ProjectOwnerHandler,
    ProjectReviewHandler,
    ProjectInteractionHandler,
  ],
  exports: [],
})
export class DiscoveryModule {}

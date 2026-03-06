import { Module } from '@nestjs/common';

import { Clock, SystemClock } from '@/infra/lib/clock.js';

import { PostRankingService } from './domain/services/post-ranking.service.js';
import { GetCategoryFiltersInteractor } from './application/use-cases/get-category-filters/get-category-filters.interactor.js';
import { GetCategoryItemsInteractor } from './application/use-cases/get-category-items/get-category-items.interactor.js';
import { GetCategoryListInteractor } from './application/use-cases/get-category-list/get-category-list.interactor.js';
import { GetFeedInteractor } from './application/use-cases/get-feed/get-feed.interactor.js';
import { GetLikedItemsInteractor } from './application/use-cases/get-liked-items/get-liked-items.interactor.js';
import { SearchItemsInteractor } from './application/use-cases/search-items/search-items.interactor.js';

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
  ],
  exports: [],
})
export class DiscoveryModule {}

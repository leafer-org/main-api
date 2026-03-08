// TODO: DLQ-процессор (cron 10с, exponential backoff 10с→5мин, макс 10 попыток, таблица dead_letter_events)
import { Module } from '@nestjs/common';

// --- Cron ---
import { CategoryCountsCron } from './adapters/cron/category-counts.cron.js';
import { DrizzleCategoryFiltersQuery } from './adapters/db/queries/category-filters.query.js';
import { DrizzleCategoryListQuery } from './adapters/db/queries/category-list.query.js';
import { DrizzleItemQuery } from './adapters/db/queries/item.query.js';
// --- DB Adapters ---
import { DrizzleItemCandidatesQuery } from './adapters/db/queries/item-candidates.query.js';
import { DrizzleLikedItemsQuery } from './adapters/db/queries/liked-items.query.js';
import { DrizzleNewSellerItemsQuery } from './adapters/db/queries/new-seller-items.query.js';
import { DrizzleCategoryProjectionRepository } from './adapters/db/repositories/category-projection.repository.js';
import { DrizzleIdempotencyRepository } from './adapters/db/repositories/idempotency.repository.js';
import { DrizzleItemProjectionRepository } from './adapters/db/repositories/item-projection.repository.js';
import { DrizzleItemTypeProjectionRepository } from './adapters/db/repositories/item-type-projection.repository.js';
import { DrizzleLikeWriteRepository } from './adapters/db/repositories/like-write.repository.js';
import { DrizzleOwnerProjectionRepository } from './adapters/db/repositories/owner-projection.repository.js';
// --- Stub Adapters (Gorse) ---
import { GorseSyncStub } from './adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from './adapters/gorse/recommendation.stub.js';
// --- HTTP ---
import { CategoriesController } from './adapters/http/categories.controller.js';
import { CategoryItemsController } from './adapters/http/category-items.controller.js';
import { FeedController } from './adapters/http/feed.controller.js';
import { LikedItemsController } from './adapters/http/liked-items.controller.js';
import { LikesController } from './adapters/http/likes.controller.js';
import { SearchController } from './adapters/http/search.controller.js';
import { CategoryProjectionKafkaHandler } from './adapters/kafka/category-projection.handler.js';
import { InteractionProjectionKafkaHandler } from './adapters/kafka/interaction-projection.handler.js';
// --- Kafka Handlers ---
import { ItemProjectionKafkaHandler } from './adapters/kafka/item-projection.handler.js';
import { ItemTypeProjectionKafkaHandler } from './adapters/kafka/item-type-projection.handler.js';
import { OwnerProjectionKafkaHandler } from './adapters/kafka/owner-projection.handler.js';
import { ReviewProjectionKafkaHandler } from './adapters/kafka/review-projection.handler.js';
// --- Real Adapters ---
import { MeilisearchSyncAdapter } from './adapters/meilisearch/meilisearch-sync.adapter.js';
import { MeiliSearchQuery } from './adapters/meilisearch/search.adapter.js';
import { RedisRankedListCache } from './adapters/redis/ranked-list-cache.adapter.js';
// --- Application ---
import {
  CategoryFiltersQueryPort,
  CategoryListQueryPort,
  ItemCandidatesPort,
  ItemQueryPort,
  LikedItemsQueryPort,
  LikeWritePort,
  NewSellerItemsPort,
  RankedListCachePort,
  RecommendationService,
  SearchPort,
} from './application/ports.js';
import {
  CategoryProjectionPort,
  IdempotencyPort,
  ItemProjectionPort,
  ItemTypeProjectionPort,
  OwnerProjectionPort,
} from './application/projection-ports.js';
import { GorseSyncPort, MeilisearchSyncPort } from './application/sync-ports.js';
import { GetCategoryFiltersInteractor } from './application/use-cases/get-category-filters/get-category-filters.interactor.js';
import { GetCategoryItemsInteractor } from './application/use-cases/get-category-items/get-category-items.interactor.js';
import { GetCategoryListInteractor } from './application/use-cases/get-category-list/get-category-list.interactor.js';
import { GetFeedInteractor } from './application/use-cases/get-feed/get-feed.interactor.js';
import { GetLikedItemsInteractor } from './application/use-cases/get-liked-items/get-liked-items.interactor.js';
import { LikeItemInteractor } from './application/use-cases/like-item/like-item.interactor.js';
import { ProjectCategoryHandler } from './application/use-cases/project-category/project-category.handler.js';
import { ProjectInteractionHandler } from './application/use-cases/project-interaction/project-interaction.handler.js';
import { ProjectItemHandler } from './application/use-cases/project-item/project-item.handler.js';
import { ProjectItemTypeHandler } from './application/use-cases/project-item-type/project-item-type.handler.js';
import { ProjectOwnerHandler } from './application/use-cases/project-owner/project-owner.handler.js';
import { ProjectReviewHandler } from './application/use-cases/project-review/project-review.handler.js';
import { SearchItemsInteractor } from './application/use-cases/search-items/search-items.interactor.js';
import { UnlikeItemInteractor } from './application/use-cases/unlike-item/unlike-item.interactor.js';
import { PostRankingService } from './domain/services/post-ranking.service.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Module({
  controllers: [
    CategoriesController,
    CategoryItemsController,
    FeedController,
    LikedItemsController,
    LikesController,
    SearchController,
  ],
  providers: [
    // Infrastructure
    { provide: Clock, useClass: SystemClock },

    // Domain services
    PostRankingService,

    // Use cases / Interactors
    GetFeedInteractor,
    GetCategoryItemsInteractor,
    GetCategoryFiltersInteractor,
    GetCategoryListInteractor,
    SearchItemsInteractor,
    GetLikedItemsInteractor,
    LikeItemInteractor,
    UnlikeItemInteractor,

    // Projection handlers
    ProjectItemHandler,
    ProjectCategoryHandler,
    ProjectItemTypeHandler,
    ProjectOwnerHandler,
    ProjectReviewHandler,
    ProjectInteractionHandler,

    // Cron
    CategoryCountsCron,

    // Query port → adapter bindings
    { provide: ItemCandidatesPort, useClass: DrizzleItemCandidatesQuery },
    { provide: ItemQueryPort, useClass: DrizzleItemQuery },
    { provide: CategoryFiltersQueryPort, useClass: DrizzleCategoryFiltersQuery },
    { provide: CategoryListQueryPort, useClass: DrizzleCategoryListQuery },

    // Projection port → adapter bindings
    { provide: ItemProjectionPort, useClass: DrizzleItemProjectionRepository },
    { provide: CategoryProjectionPort, useClass: DrizzleCategoryProjectionRepository },
    { provide: ItemTypeProjectionPort, useClass: DrizzleItemTypeProjectionRepository },
    { provide: OwnerProjectionPort, useClass: DrizzleOwnerProjectionRepository },
    { provide: IdempotencyPort, useClass: DrizzleIdempotencyRepository },

    // Write port → adapter bindings
    { provide: LikeWritePort, useClass: DrizzleLikeWriteRepository },

    // Real adapters
    { provide: MeilisearchSyncPort, useClass: MeilisearchSyncAdapter },
    { provide: SearchPort, useClass: MeiliSearchQuery },
    { provide: RankedListCachePort, useClass: RedisRankedListCache },
    { provide: NewSellerItemsPort, useClass: DrizzleNewSellerItemsQuery },
    { provide: LikedItemsQueryPort, useClass: DrizzleLikedItemsQuery },

    // Stub adapters (Gorse)
    { provide: GorseSyncPort, useClass: GorseSyncStub },
    { provide: RecommendationService, useClass: RecommendationStub },

    // Kafka handlers
    ItemProjectionKafkaHandler,
    CategoryProjectionKafkaHandler,
    ItemTypeProjectionKafkaHandler,
    OwnerProjectionKafkaHandler,
    ReviewProjectionKafkaHandler,
    InteractionProjectionKafkaHandler,
  ],
  exports: [],
})
export class DiscoveryModule {}

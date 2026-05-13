// TODO: DLQ-процессор (cron 10с, exponential backoff 10с→5мин, макс 10 попыток, таблица dead_letter_events)
import { Module } from '@nestjs/common';

import { DrizzleItemCardEnrichmentQuery } from './adapters/db/queries/item-card-enrichment.query.js';
import { DrizzleItemQuery } from './adapters/db/queries/item.query.js';
// --- DB Adapters ---
import { DrizzleLikedItemsQuery } from './adapters/db/queries/liked-items.query.js';
import { DrizzleOrganizationProfileQuery } from './adapters/db/queries/organization-profile.query.js';
import { DrizzleSearchSuggestionsQuery } from './adapters/db/queries/search-suggestions.query.js';
import { DrizzleIdempotencyRepository } from './adapters/db/repositories/idempotency.repository.js';
import { DrizzleItemProjectionRepository } from './adapters/db/repositories/item-projection.repository.js';
import { DrizzleLikeWriteRepository } from './adapters/db/repositories/like-write.repository.js';
import { DrizzleOwnerProjectionRepository } from './adapters/db/repositories/owner-projection.repository.js';
import { DrizzleSearchLogRepository } from './adapters/db/repositories/search-log.repository.js';
// --- Gorse Adapters ---
import { GorseSyncAdapter } from './adapters/gorse/gorse-sync.adapter.js';
import { GorseRecommendationAdapter } from './adapters/gorse/recommendation.adapter.js';
// --- HTTP ---
import { CategoriesController } from './adapters/http/categories.controller.js';
import { CategoryItemsController } from './adapters/http/category-items.controller.js';
import { FeedController } from './adapters/http/feed.controller.js';
import { ItemDetailController } from './adapters/http/item-detail.controller.js';
import { OrganizationDetailController } from './adapters/http/organization-detail.controller.js';
import { LikedItemsController } from './adapters/http/liked-items.controller.js';
import { LikesController } from './adapters/http/likes.controller.js';
import { SearchController } from './adapters/http/search.controller.js';
import { SearchSuggestionsController } from './adapters/http/search-suggestions.controller.js';
import { CategoryProjectionKafkaHandler } from './adapters/kafka/category-projection.handler.js';
import { InteractionProjectionKafkaHandler } from './adapters/kafka/interaction-projection.handler.js';
// --- Kafka Handlers ---
import { ItemProjectionKafkaHandler } from './adapters/kafka/item-projection.handler.js';
import { ItemTypeProjectionKafkaHandler } from './adapters/kafka/item-type-projection.handler.js';
import { OwnerProjectionKafkaHandler } from './adapters/kafka/owner-projection.handler.js';
import { ReviewProjectionKafkaHandler } from './adapters/kafka/review-projection.handler.js';
import { UserProjectionKafkaHandler } from './adapters/kafka/user-projection.handler.js';
// --- Real Adapters ---
import { MeiliCategorySearchSyncAdapter } from './adapters/meilisearch/category-search-sync.adapter.js';
import { DiscoveryCategoriesSearchClient } from './adapters/meilisearch/discovery-categories-search.index.js';
import { DiscoveryItemTypesSearchClient } from './adapters/meilisearch/discovery-item-types-search.index.js';
import { DiscoveryOrganizationsSearchClient } from './adapters/meilisearch/discovery-organizations-search.index.js';
import { MeiliItemTypeSearchSyncAdapter } from './adapters/meilisearch/item-type-search-sync.adapter.js';
import { MeilisearchSyncAdapter } from './adapters/meilisearch/meilisearch-sync.adapter.js';
import { MeiliOrganizationSearchSyncAdapter } from './adapters/meilisearch/organization-search-sync.adapter.js';
import { MeiliSearchQuery } from './adapters/meilisearch/search.adapter.js';
import { RedisRankedListCache } from './adapters/redis/ranked-list-cache.adapter.js';
// --- Application ---
import {
  ItemCardEnrichmentPort,
  ItemQueryPort,
  LikedItemsQueryPort,
  LikeWritePort,
  OrganizationProfileQueryPort,
  RankedListCachePort,
  RecommendationService,
  SearchLogPort,
  SearchPort,
  SearchSuggestionsQueryPort,
} from './application/ports.js';
import {
  IdempotencyPort,
  ItemProjectionPort,
  OwnerProjectionPort,
} from './application/projection-ports.js';
import {
  CategorySearchSyncPort,
  GorseSyncPort,
  ItemTypeSearchSyncPort,
  MeilisearchSyncPort,
  OrganizationSearchSyncPort,
} from './application/sync-ports.js';
import { GetCategoryFiltersInteractor } from './application/use-cases/browse-category/get-category-filters.interactor.js';
import { GetCategoryItemsInteractor } from './application/use-cases/browse-category/get-category-items.interactor.js';
import { GetCategoryListInteractor } from './application/use-cases/browse-category/get-category-list.interactor.js';
import { GetFeedInteractor } from './application/use-cases/browse-feed/get-feed.interactor.js';
import { GetLikedItemsInteractor } from './application/use-cases/likes/get-liked-items.interactor.js';
import { LikeItemInteractor } from './application/use-cases/likes/like-item.interactor.js';
import { UnlikeItemInteractor } from './application/use-cases/likes/unlike-item.interactor.js';
import { ProjectCategoryHandler } from './application/use-cases/project-category/project-category.handler.js';
import { ProjectInteractionHandler } from './application/use-cases/project-interaction/project-interaction.handler.js';
import { ProjectItemHandler } from './application/use-cases/project-item/project-item.handler.js';
import { ProjectItemTypeHandler } from './application/use-cases/project-item-type/project-item-type.handler.js';
import { ProjectOwnerHandler } from './application/use-cases/project-owner/project-owner.handler.js';
import { ProjectReviewHandler } from './application/use-cases/project-review/project-review.handler.js';
import { ProjectUserHandler } from './application/use-cases/project-user/project-user.handler.js';
import { GetSearchSuggestionsInteractor } from './application/use-cases/search/get-search-suggestions.interactor.js';
import { SearchItemsInteractor } from './application/use-cases/search/search-items.interactor.js';
import { GetItemDetailInteractor } from './application/use-cases/view-item/get-item-detail.interactor.js';
import { GetOrganizationDetailInteractor } from './application/use-cases/view-organization/get-organization-detail.interactor.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Module({
  controllers: [
    CategoriesController,
    CategoryItemsController,
    FeedController,
    ItemDetailController,
    LikedItemsController,
    LikesController,
    OrganizationDetailController,
    SearchController,
    SearchSuggestionsController,
  ],
  providers: [
    // Infrastructure
    { provide: Clock, useClass: SystemClock },

    // Meili search clients
    DiscoveryCategoriesSearchClient,
    DiscoveryItemTypesSearchClient,
    DiscoveryOrganizationsSearchClient,

    // Use cases / Interactors
    GetFeedInteractor,
    GetCategoryItemsInteractor,
    GetCategoryFiltersInteractor,
    GetCategoryListInteractor,
    SearchItemsInteractor,
    GetSearchSuggestionsInteractor,
    GetItemDetailInteractor,
    GetOrganizationDetailInteractor,
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
    ProjectUserHandler,

    // Query port → adapter bindings
    { provide: ItemQueryPort, useClass: DrizzleItemQuery },
    { provide: ItemCardEnrichmentPort, useClass: DrizzleItemCardEnrichmentQuery },
    { provide: OrganizationProfileQueryPort, useClass: DrizzleOrganizationProfileQuery },

    // Projection port → adapter bindings
    { provide: ItemProjectionPort, useClass: DrizzleItemProjectionRepository },
    { provide: OwnerProjectionPort, useClass: DrizzleOwnerProjectionRepository },
    { provide: IdempotencyPort, useClass: DrizzleIdempotencyRepository },

    // Write port → adapter bindings
    { provide: LikeWritePort, useClass: DrizzleLikeWriteRepository },

    // Real adapters
    { provide: MeilisearchSyncPort, useClass: MeilisearchSyncAdapter },
    { provide: CategorySearchSyncPort, useClass: MeiliCategorySearchSyncAdapter },
    { provide: ItemTypeSearchSyncPort, useClass: MeiliItemTypeSearchSyncAdapter },
    { provide: OrganizationSearchSyncPort, useClass: MeiliOrganizationSearchSyncAdapter },
    { provide: SearchPort, useClass: MeiliSearchQuery },
    { provide: SearchSuggestionsQueryPort, useClass: DrizzleSearchSuggestionsQuery },
    { provide: SearchLogPort, useClass: DrizzleSearchLogRepository },
    { provide: RankedListCachePort, useClass: RedisRankedListCache },
    { provide: LikedItemsQueryPort, useClass: DrizzleLikedItemsQuery },

    // Gorse adapters
    { provide: GorseSyncPort, useClass: GorseSyncAdapter },
    { provide: RecommendationService, useClass: GorseRecommendationAdapter },

    // Kafka handlers
    ItemProjectionKafkaHandler,
    CategoryProjectionKafkaHandler,
    ItemTypeProjectionKafkaHandler,
    OwnerProjectionKafkaHandler,
    ReviewProjectionKafkaHandler,
    InteractionProjectionKafkaHandler,
    UserProjectionKafkaHandler,
  ],
  exports: [],
})
export class DiscoveryModule {}

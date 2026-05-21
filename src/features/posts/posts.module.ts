import { Global, Module } from '@nestjs/common';

import { UuidPostIdGenerator } from './adapters/id-generator.js';
import { DrizzleCommentQuery } from './adapters/db/queries/comment.query.js';
import { DrizzleOrganizationFreshnessQuery } from './adapters/db/queries/organization-freshness-query.adapter.js';
import { DrizzlePostQuery } from './adapters/db/queries/post.query.js';
import { DrizzleCommentRepository } from './adapters/db/repositories/comment.repository.js';
import { DrizzleOrganizationFreshnessRepository } from './adapters/db/repositories/organization-freshness.repository.js';
import { DrizzlePostLikeRepository } from './adapters/db/repositories/post-like.repository.js';
import { DrizzlePostViewRepository } from './adapters/db/repositories/post-view.repository.js';
import { DrizzlePostRepository } from './adapters/db/repositories/post.repository.js';
import { PostsController } from './adapters/http/posts.controller.js';
import { PostViewsController } from './adapters/http/post-views.controller.js';
import { FreshnessProjectionHandler } from './adapters/kafka/freshness-projection.handler.js';
import { OutboxPostEventPublisher } from './adapters/publishers/outbox-publisher.js';
import {
  CommentQueryPort,
  CommentRepository,
  OrganizationFreshnessRepository,
  PostEventPublisher,
  PostIdGenerator,
  PostLikeRepository,
  PostQueryPort,
  PostRepository,
  PostViewRepository,
} from './application/ports.js';
import { CreateCommentInteractor } from './application/use-cases/create-comment.interactor.js';
import { DeleteCommentInteractor } from './application/use-cases/delete-comment.interactor.js';
import { DeletePostInteractor } from './application/use-cases/delete-post.interactor.js';
import { EditPostInteractor } from './application/use-cases/edit-post.interactor.js';
import { LikePostInteractor } from './application/use-cases/like-post.interactor.js';
import { PublishPostInteractor } from './application/use-cases/publish-post.interactor.js';
import { RecordViewsInteractor } from './application/use-cases/record-views.interactor.js';
import { UnlikePostInteractor } from './application/use-cases/unlike-post.interactor.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';
import { OrganizationFreshnessQueryPort } from '@/kernel/application/ports/organization-freshness-query.js';

@Global()
@Module({
  controllers: [PostsController, PostViewsController],
  providers: [
    { provide: Clock, useClass: SystemClock },

    // Port → Adapter bindings
    { provide: PostRepository, useClass: DrizzlePostRepository },
    { provide: CommentRepository, useClass: DrizzleCommentRepository },
    { provide: PostLikeRepository, useClass: DrizzlePostLikeRepository },
    { provide: PostViewRepository, useClass: DrizzlePostViewRepository },
    {
      provide: OrganizationFreshnessRepository,
      useClass: DrizzleOrganizationFreshnessRepository,
    },
    { provide: PostQueryPort, useClass: DrizzlePostQuery },
    { provide: CommentQueryPort, useClass: DrizzleCommentQuery },
    {
      provide: OrganizationFreshnessQueryPort,
      useClass: DrizzleOrganizationFreshnessQuery,
    },
    { provide: PostIdGenerator, useClass: UuidPostIdGenerator },
    { provide: PostEventPublisher, useClass: OutboxPostEventPublisher },

    // Use cases
    PublishPostInteractor,
    EditPostInteractor,
    DeletePostInteractor,
    LikePostInteractor,
    UnlikePostInteractor,
    CreateCommentInteractor,
    DeleteCommentInteractor,
    RecordViewsInteractor,

    // Kafka handlers (organization_freshness projection)
    FreshnessProjectionHandler,
  ],
  exports: [OrganizationFreshnessQueryPort],
})
export class PostsModule {}

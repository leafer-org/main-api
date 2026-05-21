import { Inject, Injectable } from '@nestjs/common';

import { PostEntity } from '../../domain/aggregates/post/entity.js';
import type {
  EmptyPostError,
  PostTextTooLongError,
  PostTooManyMediaError,
} from '../../domain/aggregates/post/errors.js';
import type { PostMediaItem } from '../../domain/aggregates/post/state.js';
import {
  CannotActAsOrganizationError,
  OrganizationNotFoundForPostsError,
} from '../errors.js';
import {
  PostEventPublisher,
  PostIdGenerator,
  PostRepository,
} from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { OrganizationActorPort } from '@/kernel/application/ports/organization-actor.js';
import { OrganizationRespondabilityPort } from '@/kernel/application/ports/organization-respondability.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type {
  OrganizationId,
  PostId,
  UserId,
} from '@/kernel/domain/ids.js';

export type PublishPostCommand = {
  organizationId: OrganizationId;
  authorUserId: UserId;
  text: string;
  media: readonly PostMediaItem[];
};

export type PublishPostResult = {
  postId: PostId;
};

type PublishError =
  | OrganizationNotFoundForPostsError
  | CannotActAsOrganizationError
  | EmptyPostError
  | PostTextTooLongError
  | PostTooManyMediaError;

@Injectable()
export class PublishPostInteractor {
  public constructor(
    @Inject(PostRepository) private readonly postRepo: PostRepository,
    @Inject(PostIdGenerator) private readonly idGen: PostIdGenerator,
    @Inject(OrganizationActorPort) private readonly orgActor: OrganizationActorPort,
    @Inject(OrganizationRespondabilityPort)
    private readonly orgDirectory: OrganizationRespondabilityPort,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PostEventPublisher) private readonly publisher: PostEventPublisher,
  ) {}

  public async execute(
    cmd: PublishPostCommand,
  ): Promise<Either<PublishError, PublishPostResult>> {
    const exists = await this.orgDirectory.exists(cmd.organizationId);
    if (!exists) {
      return Left(new OrganizationNotFoundForPostsError());
    }
    const allowed = await this.orgActor.canActAs(
      cmd.organizationId,
      cmd.authorUserId,
      'posts.publish',
    );
    if (!allowed) {
      return Left(new CannotActAsOrganizationError());
    }

    return this.txHost.startTransaction(async (tx): Promise<Either<PublishError, PublishPostResult>> => {
      const postId = this.idGen.generatePostId();
      const now = this.clock.now();

      const result = PostEntity.publish({
        type: 'PublishPost',
        postId,
        organizationId: cmd.organizationId,
        authorUserId: cmd.authorUserId,
        text: cmd.text,
        media: cmd.media,
        now,
      });
      if (isLeft(result)) return result;

      await this.postRepo.save(tx, result.value.state);
      for (const event of result.value.events) {
        await this.publisher.publish(tx, event);
      }
      return Right({ postId });
    });
  }
}

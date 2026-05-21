import { Inject, Injectable } from '@nestjs/common';

import { PostEntity } from '../../domain/aggregates/post/entity.js';
import { PostNotFoundError } from '../../domain/aggregates/post/errors.js';
import { CannotDeletePostError } from '../errors.js';
import { PostEventPublisher, PostRepository } from '../ports.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { OrganizationActorPort } from '@/kernel/application/ports/organization-actor.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { PostId, UserId } from '@/kernel/domain/ids.js';

export type DeletePostCommand = {
  postId: PostId;
  actorUserId: UserId;
};

type DeleteError = PostNotFoundError | CannotDeletePostError;

@Injectable()
export class DeletePostInteractor {
  public constructor(
    @Inject(PostRepository) private readonly postRepo: PostRepository,
    @Inject(OrganizationActorPort) private readonly orgActor: OrganizationActorPort,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PostEventPublisher) private readonly publisher: PostEventPublisher,
  ) {}

  public async execute(cmd: DeletePostCommand): Promise<Either<DeleteError, void>> {
    return this.txHost.startTransaction(async (tx): Promise<Either<DeleteError, void>> => {
      const state = await this.postRepo.findById(tx, cmd.postId);
      if (state === null) return Left(new PostNotFoundError());

      const isAuthor = (state.authorUserId as string) === (cmd.actorUserId as string);
      const canOverride = isAuthor
        ? true
        : await this.orgActor.canActAs(state.organizationId, cmd.actorUserId, 'posts.publish');
      if (!canOverride) return Left(new CannotDeletePostError());

      const result = PostEntity.delete(state, { type: 'DeletePost', now: this.clock.now() });

      // Hard delete + FK ON DELETE CASCADE удалит лайки/комменты/views/reports.
      await this.postRepo.delete(tx, state.postId);
      for (const event of result.events) {
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }
}

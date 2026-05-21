import { Inject, Injectable } from '@nestjs/common';

import { CommentEntity } from '../../domain/aggregates/comment/entity.js';
import { CommentNotFoundError } from '../../domain/aggregates/comment/errors.js';
import { PostNotFoundError } from '../../domain/aggregates/post/errors.js';
import { CannotDeleteCommentError } from '../errors.js';
import {
  CommentRepository,
  PostEventPublisher,
  PostRepository,
} from '../ports.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { OrganizationActorPort } from '@/kernel/application/ports/organization-actor.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { PostCommentId, UserId } from '@/kernel/domain/ids.js';

export type DeleteCommentCommand = {
  commentId: PostCommentId;
  actorUserId: UserId;
};

type DeleteError =
  | CommentNotFoundError
  | PostNotFoundError
  | CannotDeleteCommentError;

@Injectable()
export class DeleteCommentInteractor {
  public constructor(
    @Inject(PostRepository) private readonly postRepo: PostRepository,
    @Inject(CommentRepository) private readonly commentRepo: CommentRepository,
    @Inject(OrganizationActorPort) private readonly orgActor: OrganizationActorPort,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PostEventPublisher) private readonly publisher: PostEventPublisher,
  ) {}

  public async execute(cmd: DeleteCommentCommand): Promise<Either<DeleteError, void>> {
    return this.txHost.startTransaction(async (tx): Promise<Either<DeleteError, void>> => {
      const comment = await this.commentRepo.findById(tx, cmd.commentId);
      if (comment === null) return Left(new CommentNotFoundError());

      const post = await this.postRepo.findById(tx, comment.postId);
      if (post === null) return Left(new PostNotFoundError());

      const isAuthor = (comment.authorUserId as string) === (cmd.actorUserId as string);
      const canOverride = isAuthor
        ? true
        : await this.orgActor.canActAs(
            post.organizationId,
            cmd.actorUserId,
            'posts.moderate-comments',
          );
      if (!canOverride) return Left(new CannotDeleteCommentError());

      const wasVisible = comment.moderationStatus === 'visible';
      const result = CommentEntity.delete(
        comment,
        { type: 'DeleteComment', now: this.clock.now() },
        post.organizationId,
      );

      await this.commentRepo.delete(tx, cmd.commentId);
      // commentCount считает только visible. Hidden удалили — счётчик не трогаем.
      if (wasVisible) {
        await this.postRepo.incrementCommentCount(tx, post.postId, -1);
      }
      for (const event of result.events) {
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }
}

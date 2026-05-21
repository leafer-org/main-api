import { Inject, Injectable } from '@nestjs/common';

import { CommentEntity } from '../../domain/aggregates/comment/entity.js';
import type {
  CommentTooLongError,
  EmptyCommentError,
} from '../../domain/aggregates/comment/errors.js';
import { PostNotFoundError } from '../../domain/aggregates/post/errors.js';
import {
  CommentRepository,
  PostEventPublisher,
  PostIdGenerator,
  PostRepository,
} from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { PostCommentId, PostId, UserId } from '@/kernel/domain/ids.js';

export type CreateCommentCommand = {
  postId: PostId;
  authorUserId: UserId;
  text: string;
};

export type CreateCommentResult = {
  commentId: PostCommentId;
};

type CreateError =
  | PostNotFoundError
  | EmptyCommentError
  | CommentTooLongError;

@Injectable()
export class CreateCommentInteractor {
  public constructor(
    @Inject(PostRepository) private readonly postRepo: PostRepository,
    @Inject(CommentRepository) private readonly commentRepo: CommentRepository,
    @Inject(PostIdGenerator) private readonly idGen: PostIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PostEventPublisher) private readonly publisher: PostEventPublisher,
  ) {}

  public async execute(
    cmd: CreateCommentCommand,
  ): Promise<Either<CreateError, CreateCommentResult>> {
    return this.txHost.startTransaction(async (tx): Promise<Either<CreateError, CreateCommentResult>> => {
      const post = await this.postRepo.findById(tx, cmd.postId);
      if (post === null) return Left(new PostNotFoundError());

      // Hidden post: контроллер должен вернуть 404 для не-автора/не-сотрудника.
      // Автор поста может оставить коммент на свой hidden пост (per spec).
      // Чисто-доменной проверки здесь не делаем — она в audience-aware query/HTTP.

      const commentId = this.idGen.generateCommentId();
      const result = CommentEntity.create(
        {
          type: 'CreateComment',
          commentId,
          postId: cmd.postId,
          authorUserId: cmd.authorUserId,
          text: cmd.text,
          now: this.clock.now(),
        },
        post.organizationId,
      );
      if (isLeft(result)) return result;

      await this.commentRepo.save(tx, result.value.state);
      // Счётчик растёт только если коммент visible (он всегда visible на create).
      await this.postRepo.incrementCommentCount(tx, cmd.postId, 1);
      for (const event of result.value.events) {
        await this.publisher.publish(tx, event);
      }
      return Right({ commentId });
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { PostNotFoundError } from '../../domain/aggregates/post/errors.js';
import { PostLikeRepository, PostRepository } from '../ports.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { PostId, UserId } from '@/kernel/domain/ids.js';

export type UnlikePostCommand = {
  postId: PostId;
  userId: UserId;
};

@Injectable()
export class UnlikePostInteractor {
  public constructor(
    @Inject(PostRepository) private readonly postRepo: PostRepository,
    @Inject(PostLikeRepository) private readonly likeRepo: PostLikeRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
  ) {}

  public async execute(cmd: UnlikePostCommand): Promise<Either<PostNotFoundError, void>> {
    return this.txHost.startTransaction(async (tx): Promise<Either<PostNotFoundError, void>> => {
      const state = await this.postRepo.findById(tx, cmd.postId);
      if (state === null) return Left(new PostNotFoundError());

      const removed = await this.likeRepo.removeLike(tx, cmd.postId, cmd.userId);
      if (removed) {
        await this.postRepo.incrementLikeCount(tx, cmd.postId, -1);
      }
      return Right(undefined);
    });
  }
}

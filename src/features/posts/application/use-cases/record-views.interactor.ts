import { Inject, Injectable } from '@nestjs/common';

import { PostViewBatchTooLargeError } from '../errors.js';
import { PostRepository, PostViewRepository } from '../ports.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { PostId, UserId } from '@/kernel/domain/ids.js';

export const POST_VIEW_BATCH_MAX_SIZE = 100;

export type RecordViewsCommand = {
  userId: UserId;
  postIds: readonly PostId[];
};

@Injectable()
export class RecordViewsInteractor {
  public constructor(
    @Inject(PostRepository) private readonly postRepo: PostRepository,
    @Inject(PostViewRepository) private readonly viewRepo: PostViewRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
  ) {}

  public async execute(cmd: RecordViewsCommand): Promise<Either<PostViewBatchTooLargeError, void>> {
    if (cmd.postIds.length > POST_VIEW_BATCH_MAX_SIZE) {
      return Left(new PostViewBatchTooLargeError());
    }
    if (cmd.postIds.length === 0) {
      return Right(undefined);
    }

    return this.txHost.startTransaction(async (tx) => {
      // FK constraint автоматически отфильтрует несуществующие postId. Hidden
      // посты, которые user не должен видеть, фильтруются на client-side через
      // GET /feed (тех id-шников клиент не получит). Защита от подмены id-шников
      // через прямой POST не реализуется в v1.
      const { insertedPostIds } = await this.viewRepo.recordViews(tx, cmd.userId, cmd.postIds);
      if (insertedPostIds.length > 0) {
        await this.postRepo.incrementViewCount(tx, insertedPostIds);
      }
      return Right(undefined);
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { PostEntity } from '../../domain/aggregates/post/entity.js';
import {
  type EmptyPostError,
  PostNotFoundError,
  type PostTextTooLongError,
  type PostTooManyMediaError,
} from '../../domain/aggregates/post/errors.js';
import type { PostMediaItem } from '../../domain/aggregates/post/state.js';
import { CannotEditPostError } from '../errors.js';
import { PostEventPublisher, PostRepository } from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { OrganizationActorPort } from '@/kernel/application/ports/organization-actor.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { PostId, UserId } from '@/kernel/domain/ids.js';

export type EditPostCommand = {
  postId: PostId;
  actorUserId: UserId;
  text: string | undefined;
  media: readonly PostMediaItem[] | undefined;
};

type EditError =
  | PostNotFoundError
  | CannotEditPostError
  | EmptyPostError
  | PostTextTooLongError
  | PostTooManyMediaError;

@Injectable()
export class EditPostInteractor {
  public constructor(
    @Inject(PostRepository) private readonly postRepo: PostRepository,
    @Inject(OrganizationActorPort) private readonly orgActor: OrganizationActorPort,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PostEventPublisher) private readonly publisher: PostEventPublisher,
  ) {}

  public async execute(cmd: EditPostCommand): Promise<Either<EditError, void>> {
    return this.txHost.startTransaction(async (tx): Promise<Either<EditError, void>> => {
      const state = await this.postRepo.findById(tx, cmd.postId);
      if (state === null) return Left(new PostNotFoundError());

      const isAuthor = (state.authorUserId as string) === (cmd.actorUserId as string);
      const canOverride = isAuthor
        ? true
        : await this.orgActor.canActAs(state.organizationId, cmd.actorUserId, 'posts.publish');
      if (!canOverride) return Left(new CannotEditPostError());

      const result = PostEntity.edit(state, {
        type: 'EditPost',
        text: cmd.text,
        media: cmd.media,
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      await this.postRepo.save(tx, result.value.state);
      for (const event of result.value.events) {
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }
}

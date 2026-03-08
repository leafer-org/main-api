import { Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';

import { LikeItemInteractor } from '../../application/use-cases/likes/like-item.interactor.js';
import { UnlikeItemInteractor } from '../../application/use-cases/likes/unlike-item.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import { isLeft } from '@/infra/lib/box.js';
import { ItemId } from '@/kernel/domain/ids.js';

@Controller('items')
export class LikesController {
  public constructor(
    private readonly likeItem: LikeItemInteractor,
    private readonly unlikeItem: UnlikeItemInteractor,
  ) {}

  @Post(':itemId/like')
  @HttpCode(204)
  public async like(
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.likeItem.execute({
      userId: user.userId,
      itemId: ItemId.raw(itemId),
    });

    if (isLeft(result)) {
      throw domainToHttpError(result.error.toResponse());
    }
  }

  @Delete(':itemId/like')
  @HttpCode(204)
  public async unlike(
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    await this.unlikeItem.execute({
      userId: user.userId,
      itemId: ItemId.raw(itemId),
    });
  }
}

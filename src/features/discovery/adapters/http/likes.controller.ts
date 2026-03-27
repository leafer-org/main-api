import { Body, Controller, Delete, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { LikedItemsQueryPort } from '../../application/ports.js';
import { LikeItemInteractor } from '../../application/use-cases/likes/like-item.interactor.js';
import { UnlikeItemInteractor } from '../../application/use-cases/likes/unlike-item.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { ItemId } from '@/kernel/domain/ids.js';

@Controller('items')
export class LikesController {
  public constructor(
    private readonly likeItem: LikeItemInteractor,
    private readonly unlikeItem: UnlikeItemInteractor,
    @Inject(LikedItemsQueryPort) private readonly likedItemsQuery: LikedItemsQueryPort,
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

  @Post('liked-status')
  @HttpCode(200)
  public async checkLikedStatus(
    @Body() body: PublicBody['checkLikedStatus'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['checkLikedStatus']> {
    const likedSet = await this.likedItemsQuery.checkLikedStatus(
      user.userId,
      body.itemIds.map((id) => ItemId.raw(id)),
    );
    return { likedItemIds: [...likedSet].map(String) };
  }
}

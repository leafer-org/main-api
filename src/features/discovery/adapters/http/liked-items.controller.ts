import { Controller, Get, Query } from '@nestjs/common';

import { GetLikedItemsInteractor } from '../../application/use-cases/likes/get-liked-items.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';

@Controller('liked-items')
export class LikedItemsController {
  public constructor(private readonly getLikedItems: GetLikedItemsInteractor) {}

  @Get()
  public async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('search') search?: PublicQuery['getLikedItems']['search'],
    @Query('cursor') cursor?: PublicQuery['getLikedItems']['cursor'],
    @Query('limit') limit?: PublicQuery['getLikedItems']['limit'],
  ): Promise<PublicResponse['getLikedItems']> {
    const result = await this.getLikedItems.execute({
      userId: user.userId,
      search: search ?? undefined,
      cursor: cursor ?? undefined,
      limit: Number(limit ?? 20),
    });

    const { items, nextCursor } = result.value;

    return {
      items: items.map((item) => ({
        ...item,
        likedAt: item.likedAt.toISOString(),
      })),
      nextCursor,
    } as PublicResponse['getLikedItems'];
  }
}

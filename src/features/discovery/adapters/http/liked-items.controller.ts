import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { GetLikedItemsInteractor } from '../../application/use-cases/likes/get-liked-items.interactor.js';
import { avatarImageProxy, cardImageOptions } from './image-proxy-options.js';
import { resolveItemListMedia } from './resolve-item-media.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { MediaService } from '@/kernel/application/ports/media.js';

@Controller('liked-items')
export class LikedItemsController {
  public constructor(
    private readonly getLikedItems: GetLikedItemsInteractor,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  @Get()
  public async list(
    @Req() req: Request,
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
    const loader = this.mediaService.createMediaLoader(cardImageOptions(req));
    const resolvedItems = await resolveItemListMedia(items, loader, avatarImageProxy(req));

    return {
      items: resolvedItems.map((item, i) => ({
        ...item,
        likedAt: items[i]!.likedAt.toISOString(),
      })),
      nextCursor,
    };
  }
}

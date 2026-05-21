import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { RecordViewsInteractor } from '../../application/use-cases/record-views.interactor.js';
import { throwDomainError } from './throw-domain-error.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import type { PublicBody } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { PostId } from '@/kernel/domain/ids.js';

@Controller('post-views')
export class PostViewsController {
  public constructor(private readonly recordViews: RecordViewsInteractor) {}

  @Post()
  @HttpCode(204)
  public async record(
    @Body() body: PublicBody['recordPostViews'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.recordViews.execute({
      userId: user.userId,
      postIds: body.postIds.map((id) => PostId.raw(id)),
    });
    if (isLeft(result)) throwDomainError(result.error);
  }
}

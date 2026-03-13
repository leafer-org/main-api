import { Body, Controller, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { ApproveReviewInteractor } from '../../application/use-cases/approve-review/approve-review.interactor.js';
import { RejectReviewInteractor } from '../../application/use-cases/reject-review/reject-review.interactor.js';
import { ResolveDisputeInteractor } from '../../application/use-cases/resolve-dispute/resolve-dispute.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { ReviewId } from '@/kernel/domain/ids.js';

@Controller('reviews')
export class ReviewModerationController {
  public constructor(
    private readonly approveReview: ApproveReviewInteractor,
    private readonly rejectReview: RejectReviewInteractor,
    private readonly resolveDispute: ResolveDisputeInteractor,
  ) {}

  @Post(':reviewId/approve')
  @HttpCode(204)
  public async approve(
    @Param('reviewId') reviewId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.approveReview.execute({
      reviewId: ReviewId.raw(reviewId),
      approvedBy: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'approveReview'>(result.error.toResponse());
    }
  }

  @Post(':reviewId/reject')
  @HttpCode(204)
  public async reject(
    @Param('reviewId') reviewId: string,
    @Body() body: PublicBody['rejectReview'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.rejectReview.execute({
      reviewId: ReviewId.raw(reviewId),
      rejectedBy: user.userId,
      reason: body.reason,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'rejectReview'>(result.error.toResponse());
    }
  }

  @Post(':reviewId/resolve-dispute')
  @HttpCode(204)
  public async resolveDisputeAction(
    @Param('reviewId') reviewId: string,
    @Body() body: PublicBody['resolveDispute'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.resolveDispute.execute({
      reviewId: ReviewId.raw(reviewId),
      resolvedBy: user.userId,
      resolution: body.resolution,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'resolveDispute'>(result.error.toResponse());
    }
  }
}

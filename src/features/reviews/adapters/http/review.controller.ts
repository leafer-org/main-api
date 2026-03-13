import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CreateReviewInteractor } from '../../application/use-cases/create-review/create-review.interactor.js';
import { EditReviewInteractor } from '../../application/use-cases/edit-review/edit-review.interactor.js';
import { DeleteReviewInteractor } from '../../application/use-cases/delete-review/delete-review.interactor.js';
import { ReplyToReviewInteractor } from '../../application/use-cases/reply-to-review/reply-to-review.interactor.js';
import { DisputeReviewInteractor } from '../../application/use-cases/dispute-review/dispute-review.interactor.js';
import { ReviewQueryPort } from '../../application/ports.js';
import type { ReviewState } from '../../domain/aggregates/review/state.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicQuery, PublicResponse, PublicSchemas } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { ItemId, OrganizationId, ReviewId, UserId } from '@/kernel/domain/ids.js';
import type { ReviewTarget } from '@/kernel/domain/events/review.events.js';

@Controller('reviews')
export class ReviewController {
  public constructor(
    private readonly createReview: CreateReviewInteractor,
    private readonly editReview: EditReviewInteractor,
    private readonly deleteReview: DeleteReviewInteractor,
    private readonly replyToReview: ReplyToReviewInteractor,
    private readonly disputeReview: DisputeReviewInteractor,
    @Inject(ReviewQueryPort) private readonly reviewQuery: ReviewQueryPort,
  ) {}

  // --- Read endpoints (must be before :reviewId to avoid capture) ---

  @Get('my')
  public async getMyReviews(
    @Query() query: PublicQuery['getMyReviews'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getMyReviews']> {
    const result = await this.reviewQuery.findByAuthor({
      authorId: user.userId,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map(serializeListItem),
      nextCursor: result.nextCursor,
    };
  }

  @Post('by-ids')
  @HttpCode(200)
  public async getByIds(
    @Body() body: PublicBody['getReviewsByIds'],
  ): Promise<PublicResponse['getReviewsByIds']> {
    const ids = body.ids.map((id) => ReviewId.raw(id));
    const states = await this.reviewQuery.findManyByIds(ids);

    return { items: states.map(serializeReview) };
  }

  @Get('organization/:orgId')
  public async getOrganizationReviews(
    @Param('orgId') orgId: string,
    @Query() query: PublicQuery['getOrganizationReviews'],
  ): Promise<PublicResponse['getOrganizationReviews']> {
    const result = await this.reviewQuery.findByOrganization({
      organizationId: OrganizationId.raw(orgId),
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map(serializeListItem),
      nextCursor: result.nextCursor,
    };
  }

  @Get()
  public async getByTarget(
    @Query() query: PublicQuery['getReviewsByTarget'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getReviewsByTarget']> {
    const result = await this.reviewQuery.findByTarget({
      targetType: query.targetType,
      targetId: query.targetId,
      callerUserId: user.userId,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map(serializeListItem),
      nextCursor: result.nextCursor,
    };
  }

  // --- Write endpoints ---

  @Post()
  public async create(
    @Body() body: PublicBody['createReview'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['createReview']> {
    const reviewId = ReviewId.raw(crypto.randomUUID());
    const target = buildTarget(body.targetType, body.targetId);

    const result = await this.createReview.execute({
      reviewId,
      authorId: user.userId,
      target,
      organizationId: OrganizationId.raw(body.organizationId),
      rating: body.rating,
      text: body.text ?? null,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'createReview'>(result.error.toResponse());
    }

    return serializeReview(result.value);
  }

  @Get(':reviewId')
  public async getById(
    @Param('reviewId') reviewId: string,
  ): Promise<PublicResponse['getReviewById']> {
    const state = await this.reviewQuery.findOneById(ReviewId.raw(reviewId));
    if (!state) throw new NotFoundException();

    return serializeReview(state);
  }

  @Patch(':reviewId')
  public async edit(
    @Param('reviewId') reviewId: string,
    @Body() body: PublicBody['editReview'],
  ): Promise<PublicResponse['editReview']> {
    const result = await this.editReview.execute({
      reviewId: ReviewId.raw(reviewId),
      rating: body.rating,
      text: body.text,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'editReview'>(result.error.toResponse());
    }

    return serializeReview(result.value);
  }

  @Delete(':reviewId')
  @HttpCode(204)
  public async remove(
    @Param('reviewId') reviewId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.deleteReview.execute({
      reviewId: ReviewId.raw(reviewId),
      deletedBy: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'deleteReview'>(result.error.toResponse());
    }
  }

  @Post(':reviewId/reply')
  @HttpCode(200)
  public async reply(
    @Param('reviewId') reviewId: string,
    @Body() body: PublicBody['replyToReview'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['replyToReview']> {
    const result = await this.replyToReview.execute({
      reviewId: ReviewId.raw(reviewId),
      repliedBy: user.userId,
      replyText: body.text,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'replyToReview'>(result.error.toResponse());
    }

    return serializeReview(result.value);
  }

  @Post(':reviewId/dispute')
  @HttpCode(200)
  public async dispute(
    @Param('reviewId') reviewId: string,
    @Body() body: PublicBody['disputeReview'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['disputeReview']> {
    const result = await this.disputeReview.execute({
      reviewId: ReviewId.raw(reviewId),
      disputedBy: user.userId,
      reason: body.reason,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'disputeReview'>(result.error.toResponse());
    }

    return serializeReview(result.value);
  }
}

function buildTarget(targetType: string, targetId: string): ReviewTarget {
  if (targetType === 'item') {
    return { targetType: 'item', itemId: ItemId.raw(targetId) };
  }
  return { targetType: 'organization', organizationId: OrganizationId.raw(targetId) };
}

function targetId(target: ReviewTarget): string {
  return target.targetType === 'item'
    ? (target.itemId as string)
    : (target.organizationId as string);
}

function serializeReview(state: ReviewState): PublicSchemas['Review'] {
  return {
    reviewId: state.reviewId as string,
    authorId: state.authorId as string,
    targetType: state.target.targetType,
    targetId: targetId(state.target),
    organizationId: state.organizationId as string,
    rating: state.rating as number,
    text: state.text,
    status: state.status,
    replyText: state.replyText,
    repliedBy: (state.repliedBy as string) ?? null,
    repliedAt: state.repliedAt?.toISOString() ?? null,
    disputeReason: state.disputeReason,
    disputedBy: (state.disputedBy as string) ?? null,
    disputedAt: state.disputedAt?.toISOString() ?? null,
    wasDisputed: state.wasDisputed,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

function serializeListItem(item: {
  reviewId: string;
  authorId: string;
  targetType: string;
  targetId: string;
  rating: number;
  text: string | null;
  status: string;
  replyText: string | null;
  repliedAt: Date | null;
  isMine: boolean;
  isPending: boolean;
  createdAt: Date;
}): PublicSchemas['ReviewListItem'] {
  return {
    reviewId: item.reviewId,
    authorId: item.authorId,
    targetType: item.targetType as 'item' | 'organization',
    targetId: item.targetId,
    rating: item.rating,
    text: item.text,
    status: item.status as 'pending' | 'published',
    replyText: item.replyText,
    repliedAt: item.repliedAt?.toISOString() ?? null,
    isMine: item.isMine,
    isPending: item.isPending,
    createdAt: item.createdAt.toISOString(),
  };
}

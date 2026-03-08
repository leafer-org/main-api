import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const ReviewStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('review.created'),
    Type.Literal('review.deleted'),
  ]),
  reviewId: Type.String(),
  target: Type.Object({
    targetType: Type.Union([
      Type.Literal('item'),
      Type.Literal('organization'),
    ]),
    itemId: Type.Optional(Type.String()),
    organizationId: Type.Optional(Type.String()),
  }),
  newRating: Type.Union([Type.Number(), Type.Null()]),
  newReviewCount: Type.Number(),
  createdAt: Type.Optional(Type.String()),
  deletedAt: Type.Optional(Type.String()),
});

export const reviewStreamingContract = createTypeboxContract({
  topic: 'review.streaming',
  schema: ReviewStreamingMessage,
});

export type ReviewStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof reviewStreamingContract
  >;

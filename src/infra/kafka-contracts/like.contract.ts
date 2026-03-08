import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const LikeStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('item.liked'),
    Type.Literal('item.unliked'),
  ]),
  userId: Type.String(),
  itemId: Type.String(),
  timestamp: Type.String(),
});

export const likeStreamingContract = createTypeboxContract({
  topic: 'like.streaming',
  schema: LikeStreamingMessage,
});

export type LikeStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof likeStreamingContract
  >;

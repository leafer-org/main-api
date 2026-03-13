import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const InteractionStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Literal('interaction.recorded'),
  userId: Type.String(),
  itemId: Type.String(),
  interactionType: Type.Union([
    Type.Literal('view'),
    Type.Literal('click'),
    Type.Literal('like'),
    Type.Literal('unlike'),
    Type.Literal('review'),
    Type.Literal('show-contacts'),
    Type.Literal('purchase'),
    Type.Literal('booking'),
  ]),
  timestamp: Type.String(),
});

export const interactionStreamingContract = createTypeboxContract({
  topic: 'interaction.streaming',
  schema: InteractionStreamingMessage,
});

export type InteractionStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof interactionStreamingContract
  >;

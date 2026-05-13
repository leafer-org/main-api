import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const ItemChangedMessage = Type.Object({
  id: Type.String(),
  type: Type.Literal('item.changed'),
  itemId: Type.String(),
  changedAt: Type.String(),
});

export const itemStreamingContract = createTypeboxContract({
  topic: 'item.streaming',
  schema: ItemChangedMessage,
});

export type ItemStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof itemStreamingContract
  >;

import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const ItemTypeChangedMessage = Type.Object({
  id: Type.String(),
  type: Type.Literal('item-type.changed'),
  typeId: Type.String(),
  changedAt: Type.String(),
});

export const itemTypeStreamingContract = createTypeboxContract({
  topic: 'item-type.streaming',
  schema: ItemTypeChangedMessage,
});

export type ItemTypeStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof itemTypeStreamingContract
  >;

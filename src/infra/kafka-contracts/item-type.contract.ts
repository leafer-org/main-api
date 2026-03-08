import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const ItemTypeStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('item-type.created'),
    Type.Literal('item-type.updated'),
  ]),
  typeId: Type.String(),
  name: Type.Optional(Type.String()),
  availableWidgetTypes: Type.Optional(Type.Array(Type.String())),
  requiredWidgetTypes: Type.Optional(Type.Array(Type.String())),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});

export const itemTypeStreamingContract = createTypeboxContract({
  topic: 'item-type.streaming',
  schema: ItemTypeStreamingMessage,
});

export type ItemTypeStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof itemTypeStreamingContract
  >;

import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const ItemModerationMessage = Type.Object({
  id: Type.String(),
  type: Type.Literal('item.moderation-requested'),
  itemId: Type.String(),
  organizationId: Type.String(),
  typeId: Type.String(),
  widgets: Type.Array(Type.Unknown()),
  submittedAt: Type.String(),
});

export const itemModerationContract = createTypeboxContract({
  topic: 'item.moderation',
  schema: ItemModerationMessage,
});

export type ItemModerationMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof itemModerationContract
  >;

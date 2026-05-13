import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const CategoryChangedMessage = Type.Object({
  id: Type.String(),
  type: Type.Literal('category.changed'),
  categoryId: Type.String(),
  changedAt: Type.String(),
});

export const categoryStreamingContract = createTypeboxContract({
  topic: 'category.streaming',
  schema: CategoryChangedMessage,
});

export type CategoryStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof categoryStreamingContract
  >;

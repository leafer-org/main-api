import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const UserProfileChangedMessage = Type.Object({
  userId: Type.String(),
  type: Type.Literal('user.profile-changed'),
  changedAt: Type.String(),
});

export const userStreamingContract = createTypeboxContract({
  topic: 'user.streaming',
  schema: UserProfileChangedMessage,
});

export type UserStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof userStreamingContract
  >;

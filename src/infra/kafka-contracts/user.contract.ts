import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const UserSnapshotMessage = Type.Object({
  userId: Type.String(),
  phoneNumber: Type.String(),
  fullName: Type.String(),
  role: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const userStreamingContract = createTypeboxContract({
  topic: 'user.streaming',
  schema: UserSnapshotMessage,
});

export type UserStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof userStreamingContract
  >;

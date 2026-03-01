import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const UserCreatedMessage = Type.Object({
  type: Type.Literal('user.created'),
  userId: Type.String(),
  phoneNumber: Type.String(),
  fullName: Type.String(),
  role: Type.String(),
  createdAt: Type.String(),
});

const UserProfileUpdatedMessage = Type.Object({
  type: Type.Literal('user.profile_updated'),
  userId: Type.String(),
  fullName: Type.String(),
  updatedAt: Type.String(),
});

const UserRoleUpdatedMessage = Type.Object({
  type: Type.Literal('user.role_updated'),
  userId: Type.String(),
  role: Type.String(),
  updatedAt: Type.String(),
});

export const UserEventSchema = Type.Union([
  UserCreatedMessage,
  UserProfileUpdatedMessage,
  UserRoleUpdatedMessage,
]);

export const userEventsContract = createTypeboxContract({
  topic: 'user.events',
  schema: UserEventSchema,
});

export type UserEventMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<typeof userEventsContract>;

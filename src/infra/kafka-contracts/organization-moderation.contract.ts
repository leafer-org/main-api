import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const OrganizationModerationMessage = Type.Object({
  id: Type.String(),
  type: Type.Literal('organization.moderation-requested'),
  organizationId: Type.String(),
  name: Type.String(),
  description: Type.String(),
  avatarId: Type.Union([Type.String(), Type.Null()]),
  submittedAt: Type.String(),
});

export const organizationModerationContract = createTypeboxContract({
  topic: 'organization.moderation',
  schema: OrganizationModerationMessage,
});

export type OrganizationModerationMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof organizationModerationContract
  >;

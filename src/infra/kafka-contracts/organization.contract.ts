import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const OrganizationChangedMessage = Type.Object({
  id: Type.String(),
  type: Type.Literal('organization.changed'),
  organizationId: Type.String(),
  changedAt: Type.String(),
});

export const organizationStreamingContract = createTypeboxContract({
  topic: 'organization.streaming',
  schema: OrganizationChangedMessage,
});

export type OrganizationStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof organizationStreamingContract
  >;

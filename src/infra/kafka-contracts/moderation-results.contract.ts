import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const ModerationResultMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('moderation.approved'),
    Type.Literal('moderation.rejected'),
  ]),
  entityType: Type.Union([
    Type.Literal('organization'),
    Type.Literal('item'),
  ]),
  entityId: Type.String(),
});

export const moderationResultsContract = createTypeboxContract({
  topic: 'moderation.results',
  schema: ModerationResultMessage,
});

export type ModerationResultMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof moderationResultsContract
  >;

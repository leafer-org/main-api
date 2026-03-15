import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const OrganizationStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('organization.published'),
    Type.Literal('organization.unpublished'),
  ]),
  organizationId: Type.String(),
  name: Type.Optional(Type.String()),
  avatarId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  media: Type.Optional(Type.Array(Type.Object({ type: Type.String(), mediaId: Type.String() }))),
  republished: Type.Optional(Type.Boolean()),
  publishedAt: Type.Optional(Type.String()),
  unpublishedAt: Type.Optional(Type.String()),
});

export const organizationStreamingContract = createTypeboxContract({
  topic: 'organization.streaming',
  schema: OrganizationStreamingMessage,
});

export type OrganizationStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof organizationStreamingContract
  >;

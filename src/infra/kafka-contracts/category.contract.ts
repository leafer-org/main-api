import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const CategoryStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([Type.Literal('category.published'), Type.Literal('category.unpublished')]),
  categoryId: Type.String(),
  parentCategoryId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  name: Type.Optional(Type.String()),
  iconId: Type.Optional(Type.String()),
  order: Type.Optional(Type.Number()),
  allowedTypeIds: Type.Optional(Type.Array(Type.String())),
  ageGroups: Type.Optional(Type.Array(Type.String())),
  ancestorIds: Type.Optional(Type.Array(Type.String())),
  attributes: Type.Optional(
    Type.Array(
      Type.Object({
        attributeId: Type.String(),
        name: Type.String(),
        required: Type.Boolean(),
        schema: Type.Unknown(),
      }),
    ),
  ),
  republished: Type.Optional(Type.Boolean()),
  publishedAt: Type.Optional(Type.String()),
  unpublishedAt: Type.Optional(Type.String()),
});

export const categoryStreamingContract = createTypeboxContract({
  topic: 'category.streaming',
  schema: CategoryStreamingMessage,
});

export type CategoryStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof categoryStreamingContract
  >;

import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const BaseInfoWidgetSchema = Type.Object({
  type: Type.Literal('base-info'),
  title: Type.String(),
  description: Type.String(),
  imageId: Type.Union([Type.String(), Type.Null()]),
});

const AgeGroupWidgetSchema = Type.Object({
  type: Type.Literal('age-group'),
  value: Type.String(),
});

const LocationWidgetSchema = Type.Object({
  type: Type.Literal('location'),
  cityId: Type.String(),
  lat: Type.Number(),
  lng: Type.Number(),
  address: Type.Union([Type.String(), Type.Null()]),
});

const PaymentWidgetSchema = Type.Object({
  type: Type.Literal('payment'),
  strategy: Type.Union([
    Type.Literal('free'),
    Type.Literal('one-time'),
    Type.Literal('subscription'),
  ]),
  price: Type.Union([Type.Number(), Type.Null()]),
});

const CategoryWidgetSchema = Type.Object({
  type: Type.Literal('category'),
  categoryIds: Type.Array(Type.String()),
  attributes: Type.Array(
    Type.Object({
      attributeId: Type.String(),
      value: Type.String(),
    }),
  ),
});

const OwnerWidgetSchema = Type.Object({
  type: Type.Literal('owner'),
  organizationId: Type.String(),
  name: Type.String(),
  avatarId: Type.Union([Type.String(), Type.Null()]),
});

const ItemReviewWidgetSchema = Type.Object({
  type: Type.Literal('item-review'),
  rating: Type.Union([Type.Number(), Type.Null()]),
  reviewCount: Type.Number(),
});

const OwnerReviewWidgetSchema = Type.Object({
  type: Type.Literal('owner-review'),
  rating: Type.Union([Type.Number(), Type.Null()]),
  reviewCount: Type.Number(),
});

const EventDateTimeWidgetSchema = Type.Object({
  type: Type.Literal('event-date-time'),
  dates: Type.Array(Type.String()),
});

const ScheduleEntrySchema = Type.Object({
  dayOfWeek: Type.Number(),
  startTime: Type.String(),
  endTime: Type.String(),
});

const ScheduleWidgetSchema = Type.Object({
  type: Type.Literal('schedule'),
  entries: Type.Array(ScheduleEntrySchema),
});

const WidgetSchema = Type.Union([
  BaseInfoWidgetSchema,
  AgeGroupWidgetSchema,
  LocationWidgetSchema,
  PaymentWidgetSchema,
  CategoryWidgetSchema,
  OwnerWidgetSchema,
  ItemReviewWidgetSchema,
  OwnerReviewWidgetSchema,
  EventDateTimeWidgetSchema,
  ScheduleWidgetSchema,
]);

const ItemStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('item.published'),
    Type.Literal('item.unpublished'),
  ]),
  itemId: Type.String(),
  typeId: Type.Optional(Type.String()),
  organizationId: Type.Optional(Type.String()),
  widgets: Type.Optional(Type.Array(WidgetSchema)),
  republished: Type.Optional(Type.Boolean()),
  publishedAt: Type.Optional(Type.String()),
  unpublishedAt: Type.Optional(Type.String()),
});

export const itemStreamingContract = createTypeboxContract({
  topic: 'item.streaming',
  schema: ItemStreamingMessage,
});

export type ItemStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof itemStreamingContract
  >;

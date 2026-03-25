import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const BaseWidgetSettingsSchema = Type.Object({
  type: Type.Union([
    Type.Literal('base-info'),
    Type.Literal('age-group'),
    Type.Literal('location'),
    Type.Literal('category'),
    Type.Literal('owner'),
    Type.Literal('item-review'),
    Type.Literal('owner-review'),
    Type.Literal('schedule'),
    Type.Literal('contact-info'),
    Type.Literal('team'),
  ]),
  required: Type.Boolean(),
});

const PaymentWidgetSettingsSchema = Type.Object({
  type: Type.Literal('payment'),
  required: Type.Boolean(),
  allowedStrategies: Type.Array(
    Type.Union([Type.Literal('free'), Type.Literal('one-time'), Type.Literal('subscription')]),
  ),
});

const EventDateTimeWidgetSettingsSchema = Type.Object({
  type: Type.Literal('event-date-time'),
  required: Type.Boolean(),
  maxDates: Type.Union([Type.Number(), Type.Null()]),
});

const WidgetSettingsSchema = Type.Union([
  PaymentWidgetSettingsSchema,
  EventDateTimeWidgetSettingsSchema,
  BaseWidgetSettingsSchema,
]);

const ItemTypeStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([Type.Literal('item-type.created'), Type.Literal('item-type.updated')]),
  typeId: Type.String(),
  name: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  widgetSettings: Type.Optional(Type.Array(WidgetSettingsSchema)),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});

export const itemTypeStreamingContract = createTypeboxContract({
  topic: 'item-type.streaming',
  schema: ItemTypeStreamingMessage,
});

export type ItemTypeStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof itemTypeStreamingContract
  >;

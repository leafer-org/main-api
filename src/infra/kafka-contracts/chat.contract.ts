import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

/**
 * Унифицированное сообщение потока chat.streaming. Все типы домейн-событий
 * чата (chat.* и chat.message.*) сериализуются в один объект с дискриминатором
 * `type`. Поля, не относящиеся к конкретному типу — Optional.
 *
 * Назначение: outbox → Kafka → Centrifugo-bridge для realtime подписок.
 * Bridge маршрутизирует в каналы вида `chat:{chatId}` по `chatId` ключу.
 */
const ChatStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('chat.opened'),
    Type.Literal('chat.message.sent'),
    Type.Literal('chat.message.edited'),
    Type.Literal('chat.message.deleted'),
    Type.Literal('chat.slot.claimed'),
    Type.Literal('chat.slot.released'),
    Type.Literal('chat.slot.reassigned'),
    Type.Literal('chat.blocked'),
    Type.Literal('chat.unblocked'),
    Type.Literal('chat.read'),
  ]),
  chatId: Type.String(),
  occurredAt: Type.String(), // ISO; конкретное поле-таймштамп события скопировано сюда

  // chat.opened
  contextItemId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  participants: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String(),
        kind: Type.Union([
          Type.Literal('user'),
          Type.Literal('organization'),
          Type.Literal('support'),
        ]),
        subjectId: Type.Union([Type.String(), Type.Null()]),
        assignedUserId: Type.Union([Type.String(), Type.Null()]),
      }),
    ),
  ),
  initiatorParticipantId: Type.Optional(Type.String()),

  // chat.message.* (sent / edited / deleted)
  messageId: Type.Optional(Type.String()),
  senderParticipantId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  messageKind: Type.Optional(
    Type.Union([Type.Literal('text'), Type.Literal('media'), Type.Literal('system')]),
  ),
  text: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  mediaIds: Type.Optional(Type.Array(Type.String())),
  systemEvent: Type.Optional(
    Type.Union([
      Type.Object({
        type: Type.String(),
        payload: Type.Record(Type.String(), Type.Unknown()),
      }),
      Type.Null(),
    ]),
  ),
  actorUserId: Type.Optional(Type.String()),

  // slot.*
  participantId: Type.Optional(Type.String()),
  userId: Type.Optional(Type.String()),
  oldAssigneeUserId: Type.Optional(Type.String()),
  newAssigneeUserId: Type.Optional(Type.String()),

  // block / unblock / read
  byParticipantId: Type.Optional(Type.String()),
  reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  upToMessageId: Type.Optional(Type.String()),
  // chat.read — per-user cursor
  readerUserId: Type.Optional(Type.String()),
  slotKind: Type.Optional(
    Type.Union([Type.Literal('user'), Type.Literal('organization'), Type.Literal('support')]),
  ),
});

export const chatStreamingContract = createTypeboxContract({
  topic: 'chat.streaming',
  schema: ChatStreamingMessage,
});

export type ChatStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof chatStreamingContract
  >;

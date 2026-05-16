# Refactor 4 — Chat per-user read cursors

## Цель

`myUnreadCount` в shared inbox должен считаться **per-user**: сотрудник, не прочитавший чат, видит счётчик независимо от того, что прочитал коллега из той же организации.

Сейчас [`chat.query.ts:319-341`](../src/features/chat/adapters/db/queries/chat.query.ts) считает unread только для участников, где `kind='user' AND subject_id=я` ИЛИ `assigned_user_id=я`. Для organization-slot'а, не claim'нутого текущим сотрудником, оба условия false → unread всегда 0.

Корневая причина: `last_read_message_id` живёт в `chat_participants` (один курсор на slot, общий для всей орг). Нет per-user state.

## Решение

Удалить `lastReadMessageId` из state агрегата и из таблицы `chat_participants`. Завести таблицу `chat_participant_user_reads(participant_id, user_id, last_read_message_id, last_read_at)` как единственный источник правды для unread — и для user-slot'ов, и для organization-slot'ов.

## 1. Domain (`src/features/chat/domain/aggregates/chat/`)

**Команда** [`commands.ts:88-93`](../src/features/chat/domain/aggregates/chat/commands.ts):
- `MarkReadCommand { actorUserId, upToMessageId, now }`. Убрать `participantId`.

**Событие** [`events.ts:93-99`](../src/features/chat/domain/aggregates/chat/events.ts):
- `ChatReadEvent { type:'chat.read', chatId, participantId, readerUserId, slotKind, upToMessageId, readAt }`. Добавляем `readerUserId` и `slotKind`.

**State** [`state.ts:19`](../src/features/chat/domain/aggregates/chat/state.ts):
- Удалить `lastReadMessageId` из `ChatParticipant`.

**Decide / Apply** [`entity.ts:643-666`](../src/features/chat/domain/aggregates/chat/entity.ts):
- Найти `participantId` slot'а, через который actor валиден.
- State не меняем. Эмитим только событие.
- Никакой no-op оптимизации — она переезжает в идемпотентный handler.

## 2. БД и миграция

```sql
CREATE TABLE chat_participant_user_reads (
  participant_id UUID NOT NULL REFERENCES chat_participants(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  last_read_message_id UUID NOT NULL,
  last_read_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (participant_id, user_id)
);
CREATE INDEX idx_cpur_user ON chat_participant_user_reads(user_id);

ALTER TABLE chat_participants DROP COLUMN last_read_message_id;
```

По правилу CLAUDE.md: `rm -rf drizzle && yarn db:generate`. Без backfill, не в проде.

## 3. Application — `MarkReadInteractor`

[`mark-read.interactor.ts:22-65`](../src/features/chat/application/use-cases/mark-read.interactor.ts):
- Принимает `chatId, actorUserId, upToMessageId`.
- Один вызов `PermissionCheckService.canReadChat(actor, chatId)` — заменяет всю ручную логику поиска participant по `subjectId`/`assignedUserId`/membership.
- Передаёт команду в `agg.markRead(actorUserId, upToMessageId, now)`. Save → outbox.

## 4. Adapter — Kafka projection handler

Новый `src/features/chat/adapters/kafka/chat-read.handler.ts`:

```sql
INSERT INTO chat_participant_user_reads
  (participant_id, user_id, last_read_message_id, last_read_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (participant_id, user_id) DO UPDATE
  SET last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at
  WHERE chat_participant_user_reads.last_read_at < EXCLUDED.last_read_at;
```

Идемпотентно, защищено от перестановки событий.

## 5. Adapter — read model query

[`chat.query.ts:319-341`](../src/features/chat/adapters/db/queries/chat.query.ts):

```sql
LEFT JOIN chat_participant_user_reads cpur
  ON cpur.participant_id = cp.id AND cpur.user_id = ${me}
WHERE
  (cp.kind = 'user' AND cp.subject_id = ${me})
  OR cp.assigned_user_id = ${me}
  OR (cp.kind = 'organization' AND cp.subject_id IN (
       SELECT organization_id FROM organization_memberships
       WHERE user_id = ${me} AND status = 'active'
     ))
```

Unread считается напрямую относительно `cpur.last_read_message_id` (NULL ⇒ все непрочитаны). Никаких `COALESCE`, никаких чтений из удалённого `cp.last_read_message_id`.

`PermissionCheckService` в query **не вызывается** — это нарушение слоёв. Membership-сабквери дублирует часть логики permission на SQL-стороне; нормальная цена за отсутствие batch-API у permission service.

## 6. Outbox publisher

[`outbox-publisher.ts:151-159`](../src/features/chat/adapters/publishers/outbox-publisher.ts) — добавить `readerUserId` и `slotKind` в payload `chat.read`. Обновить integration-event схему.

## 7. HTTP

Контракт не меняется. `POST /chats/{chatId}/read` с body `{ upToMessageId }` — как сейчас.

## 8. Тесты

- **Unit Decide** [`entity.spec.ts:777-808`](../src/features/chat/domain/aggregates/chat/entity.spec.ts) — переписать: проверяем только эмит события с `readerUserId` и `slotKind`. Тесты на изменение `lastReadMessageId` в state — удалить.
- **Unit interactor** — три кейса permission'а (subject user-slot, claim-assigned, member организации) через мок `PermissionCheckService`; отказ для непривилегированного user.
- **E2E старый** [`chat-flow.e2e-spec.ts:201-231`](../src/test/e2e/features/chat/chat-flow.e2e-spec.ts) — поправить ожидания: unread теперь из `chat_participant_user_reads`, не из `cp.last_read_message_id`. Семантика после mark-read та же.
- **E2E новый** `chat-shared-inbox-unread.e2e-spec.ts`: два сотрудника А и Б одной орг, клиент пишет → у обоих count=1; А делает mark-read → А=0, Б=1.

## 9. Порядок PR'ов

1. **PR1 — Domain + миграция:** убрать `lastReadMessageId` из state и БД, расширить событие, упростить interactor через `PermissionCheckService`. На этой стадии unread временно всегда 0.
2. **PR2 — Projection handler + query rewrite:** новый handler заполняет `chat_participant_user_reads`, query читает оттуда. Unread снова работает корректно — и для user-slot, и для org-slot.
3. **PR3 — Shared-inbox e2e:** новый e2e на два сотрудника одной орг.

Если предпочтительнее — можно слить в один PR, но раздельные позволяют каждому шагу пройти ревью изолированно.

## Открытое допущение

Текущий permission `canReadChat` (или как он называется в коде) уже корректно разрешает active members организации к org-slot чатам. Если нет — повышение покрытия делается там, не в interactor.

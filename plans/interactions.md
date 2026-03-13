# Feature: Interactions (Взаимодействия)

## Концепция

Модуль-агрегатор пользовательских взаимодействий. Единый producer топика `interaction.streaming`, который:
- Предоставляет HTTP endpoints для front-end (view, click, show-contacts)
- Слушает Kafka-события из других фич (`like.streaming`, `review.streaming`)
- Записывает все взаимодействия в таблицу PostgreSQL для будущей аналитики
- Публикует `interaction.recorded` события напрямую в Kafka (без outbox — потеря не критична)

Discovery остаётся чистым consumer'ом `interaction.streaming` — читает и шлёт feedback в Gorse.

---

## Обоснование отдельного модуля

### Почему не расширять Discovery?

1. **Discovery — read-only витрина.** Write-endpoints (record view) нарушают её ответственность
2. **Единый producer.** Сейчас `interaction.streaming` — мёртвый топик (контракт есть, producer нет). Лайки идут в `like.streaming` и до Gorse не доходят. Модуль interactions закрывает этот разрыв
3. **Аналитика (волна 3).** Хранилище взаимодействий — отдельный bounded context от рекомендаций
4. **Чистый data flow:** `[HTTP/Kafka] → Interactions → interaction.streaming → Discovery (Gorse) + будущая Analytics`

### Почему не kernel?

Interactions — полноценная фича со своим хранилищем, HTTP endpoints и Kafka consumers. В kernel не подходит.

---

## Ключевые решения

### Только залогиненные пользователи

Все endpoints требуют `userId` из сессии. Анонимный трекинг — за scope.

### View = impression в ленте (~80% трафика)

`view` — показ карточки в ленте/поиске/категориях при scroll into viewport. Высокочастотное событие. Front-end собирает видимые itemIds и отправляет batch. Нейтральный сигнал для Gorse — помогает оценивать эффективность рекомендаций (показали, но не кликнули = слабый интерес).

### Batch endpoint для views

Одна прокрутка ленты = 10-20 карточек. `POST /interactions/views { itemIds: [...] }` принимает массив.

### Дедупликация view — 1 раз в час

Один `view` на (userId, itemId) за 1 час. Повторные показы игнорируются.

### PostgreSQL таблица

Обычный Postgres. Таблица `interactions` с индексами по `timestamp`. TODO: рассмотреть партиционирование при росте данных.

### Без outbox — direct Kafka publish

Взаимодействия — аналитические данные, не бизнес-критичные. DB insert + прямой publish в Kafka. Если Kafka недоступен — запись в DB сохраняется (аналитика), событие в Gorse теряется (допустимо).

### Лайки — слушаем, не переносим

Interactions слушает `like.streaming` и конвертирует в `interaction.streaming`. Write-часть лайков остаётся в Discovery.

### review.streaming → interaction для items

При `review.created` с `target.targetType === 'item'` — записываем interaction type `review`. Сильный сигнал: оставил отзыв = пользовался услугой.

### show-contacts — конверсионный сигнал

Раскрытие контактов организации на странице товара. Высокий вес — intent к покупке/записи.

---

## Data Flow

```
┌───────────────────────────────────────────────────────┐
│                  INTERACTIONS MODULE                    │
│                                                         │
│  HTTP Endpoints            Kafka Consumers              │
│  ┌────────────────┐    ┌─────────────────────────┐     │
│  │ POST /views    │    │ like.streaming           │     │
│  │   { itemIds }  │    │  → item.liked → like     │     │
│  │ POST /click    │    │  → item.unliked → unlike │     │
│  │ POST /show-    │    ├─────────────────────────┤     │
│  │    contacts    │    │ review.streaming         │     │
│  └──────┬─────────┘    │  → review.created(item)  │     │
│         │              │    → review interaction  │     │
│         │              └──────────┬──────────────┘     │
│         │                         │                     │
│         └────────┬────────────────┘                     │
│                  ▼                                       │
│        ┌─────────────────┐     ┌──────────────────┐    │
│        │  interactions   │     │  Kafka producer   │    │
│        │  table          │     │  (direct publish) │    │
│        │  (PostgreSQL)   │     │  interaction.     │    │
│        │                 │     │    streaming      │    │
│        └─────────────────┘     └──────────────────┘    │
└───────────────────────────────────────────────────────┘
                                        │
                          ┌─────────────┼─────────────┐
                          ▼                           ▼
                 Discovery (Gorse)           Future Analytics
                 (уже реализовано)           (волна 3)
```

---

## Типы данных

### InteractionType (расширение kernel)

```typescript
// src/kernel/domain/events/interaction.events.ts
export type InteractionType =
  | 'view'
  | 'click'
  | 'like'
  | 'unlike'
  | 'review'
  | 'show-contacts'   // NEW
  | 'purchase'
  | 'booking';
```

### Kafka-контракт interaction.streaming (обновление)

Добавить `show-contacts` и `review` в `interactionType` union:

```typescript
// src/infra/kafka-contracts/interaction.contract.ts
interactionType: Type.Union([
  Type.Literal('view'),
  Type.Literal('click'),
  Type.Literal('like'),
  Type.Literal('unlike'),
  Type.Literal('review'),          // NEW
  Type.Literal('show-contacts'),   // NEW
  Type.Literal('purchase'),
  Type.Literal('booking'),
]),
```

### Interaction (запись в таблицу)

```typescript
type Interaction = {
  id: string;           // uuidv7
  userId: UserId;
  itemId: ItemId;
  type: InteractionType;
  timestamp: Date;
  metadata?: Record<string, unknown>;  // extensible: { reviewId }, { source: 'feed' | 'search' | 'category' }
};
```

---

## Структура файлов

```
src/features/interactions/
  domain/
    interaction.ts                          # Interaction type

  application/
    ports.ts                                # InteractionWritePort, InteractionDedupPort
    use-cases/
      record-views/
        record-views.interactor.ts          # batch views: dedup + DB + publish
      record-interaction/
        record-interaction.interactor.ts    # single interaction (click, show-contacts)
      consume-like/
        consume-like.handler.ts             # like.streaming → interaction
      consume-review/
        consume-review.handler.ts           # review.streaming → interaction (item only)

  adapters/
    http/
      interactions.controller.ts            # POST endpoints
    db/
      schema.ts                             # таблица interactions
      interaction-write.repository.ts       # insert into interactions
    kafka/
      consumer-ids.ts
      interaction-publisher.adapter.ts      # direct Kafka publish to interaction.streaming
      like-consumer.handler.ts              # Kafka adapter → consume-like handler
      review-consumer.handler.ts            # Kafka adapter → consume-review handler

  interactions.module.ts
```

---

## HTTP API

### POST /interactions/views

Batch запись impressions. Front-end вызывает при scroll into viewport.

```
Auth: required
Body: { itemIds: string[] }       // max 50
Response: 204 No Content
```

Дедупликация: 1 view на (userId, itemId) в час. Из батча записываются только те itemIds, для которых нет записи за последний час.

### POST /interactions/click

Запись перехода на detail page.

```
Auth: required
Body: { itemId: string }
Response: 204 No Content
```

### POST /interactions/show-contacts

Запись раскрытия контактов организации.

```
Auth: required
Body: { itemId: string }
Response: 204 No Content
```

---

## DB Schema

```sql
CREATE TABLE interactions (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL,
  item_id     UUID NOT NULL,
  type        TEXT NOT NULL,
  metadata    JSONB,
  timestamp   TIMESTAMPTZ NOT NULL
);

-- Индексы
CREATE INDEX idx_interactions_user      ON interactions (user_id, timestamp DESC);
CREATE INDEX idx_interactions_item      ON interactions (item_id, timestamp DESC);
CREATE INDEX idx_interactions_type      ON interactions (type, timestamp DESC);
-- Дедупликация views: быстрый lookup последнего view за час
CREATE INDEX idx_interactions_dedup     ON interactions (user_id, item_id, type, timestamp DESC);
```

---

## Задачи

### Фаза 0 — Подготовка kernel и контрактов

- [ ] **0.1** Расширить `InteractionType` в `kernel/domain/events/interaction.events.ts` — добавить `'review'` и `'show-contacts'`
- [ ] **0.2** Обновить `interaction.contract.ts` — добавить `'review'` и `'show-contacts'` в union
- [ ] **0.3** Добавить OpenAPI контракт для новых endpoints в `http-contracts/endpoints/`
- [ ] **0.4** Запустить `yarn openapi`

### Фаза 1 — Модуль и DB

- [ ] **1.1** Создать `interactions.module.ts` с базовой структурой
- [ ] **1.2** Создать Drizzle-схему для `interactions` таблицы
- [ ] **1.3** Удалить папку `drizzle/` и пересоздать миграцию
- [ ] **1.4** Реализовать `InteractionWritePort` (abstract class) — insert
- [ ] **1.6** Реализовать `InteractionDedupPort` (abstract class) — проверка последнего view за час
- [ ] **1.7** Реализовать `InteractionPublisherPort` (abstract class) — direct Kafka publish
- [ ] **1.8** Реализовать DB и Kafka адаптеры
- [ ] **1.9** Зарегистрировать модуль в `app.module.ts`

### Фаза 2 — HTTP endpoints

- [ ] **2.1** Реализовать `RecordViewsInteractor` — batch дедупликация + write + publish. Принимает `{ userId, itemIds }`, фильтрует по dedup port, записывает и публикует оставшиеся
- [ ] **2.2** Реализовать `RecordInteractionInteractor` — одиночная запись для click, show-contacts
- [ ] **2.3** Создать `InteractionsController` — `POST /interactions/views`, `/click`, `/show-contacts`
- [ ] **2.4** Зарегистрировать controller и interactors в модуле

### Фаза 3 — Kafka consumers

- [ ] **3.1** Создать `ConsumeLikeHandler` — `item.liked` → `interaction(like)`, `item.unliked` → `interaction(unlike)`
- [ ] **3.2** Создать `LikeConsumerKafkaHandler` — адаптер для `like.streaming`
- [ ] **3.3** Создать `ConsumeReviewHandler` — `review.created` с `target.targetType === 'item'` → `interaction(review)`. Ignore `review.deleted` и organization targets
- [ ] **3.4** Создать `ReviewConsumerKafkaHandler` — адаптер для `review.streaming`
- [ ] **3.5** Зарегистрировать handlers и consumer group в модуле

### Фаза 4 — Обновить Gorse веса в Discovery

- [ ] **4.1** Обновить `ProjectInteractionHandler` — добавить обработку `review` и `show-contacts` типов

### Фаза 5 — E2E тесты

- [ ] **5.1** Тест: POST /interactions/views с batch itemIds → 204, события в `interaction.streaming`
- [ ] **5.2** Тест: дедупликация views — повторный batch за час не создаёт дублей
- [ ] **5.3** Тест: POST /interactions/click → 204 + событие
- [ ] **5.4** Тест: POST /interactions/show-contacts → 204 + событие
- [ ] **5.5** Тест: like.streaming → interaction.streaming конвертация
- [ ] **5.6** Тест: review.streaming (item target) → interaction.streaming
- [ ] **5.7** Тест: review.streaming (organization target) → игнорируется
- [ ] **5.8** Тест: неавторизованный запрос → 401

---

## Веса feedback в Gorse

Настроены в Discovery `ProjectInteractionHandler`. После добавления новых типов:

| Type | Вес | Обоснование |
|------|-----|-------------|
| view | 1 | Impression — показали карточку, нейтральный сигнал |
| click | 2 | Переход на detail page — активный интерес |
| like | 4 | Явное одобрение |
| review | 5 | Оставил отзыв = пользовался услугой |
| show-contacts | 6 | Конверсионный intent |
| purchase / booking | 8 | Транзакция |

---

## Связь с другими фичами

```
Discovery (write лайков)
  → like.streaming
    → Interactions (consumer) → DB + interaction.streaming

Reviews (write отзывов)
  → review.streaming
    → Interactions (consumer) → DB + interaction.streaming

Front-end (views batch, click, show-contacts)
  → Interactions (HTTP) → DB + interaction.streaming

interaction.streaming
  → Discovery (ProjectInteractionHandler → Gorse feedback)
  → Future: Analytics, Notifications
```

Feature `interactions` **не импортирует** другие features. Коммуникация — через kernel events и Kafka.

---

## Будущее

- **Analytics dashboards (волна 3)** — агрегаты по org/item
- **Новые interaction types** — `booking`, `purchase` из соответствующих фич по тому же паттерну
- **Rate limiting** — если view-спам, throttle на controller уровне
- **Retention policy** — cron/scheduled job для удаления старых данных (> 6 мес)

# Feature: Reviews (Отзывы)

## Концепция

Отдельная фича `reviews` — пользователи оставляют отзывы на Item или Organization. Агрегат `Review` управляет жизненным циклом: черновик → публикация (с автомодерацией) → возможное оспаривание / удаление. Владелец организации может ответить на отзыв или оспорить его. Discovery получает агрегированные данные (рейтинг, количество) через Kafka.

---

## Ключевые решения

### Рейтинг — половинки (0.5 шаг)
Допустимые значения: 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5. Value object `Rating` с валидацией.

### Автомодерация по порогу
- Рейтинг >= 4 → `published` сразу
- Рейтинг < 4 → `pending` (на модерацию)
- Kafka-событие `review.created` отправляется только при переходе в `published`

### Один отзыв на (user, target)
Уникальность проверяется в interactor через query перед созданием. Агрегат идентифицируется по `ReviewId` (UUID).

### Ответ владельца — поле в агрегате
Один ответ на отзыв. Не отдельный агрегат. Поля: `replyText`, `repliedBy` (UserId), `repliedAt` (Date).

### Подсчёт newRating / newReviewCount
Interactor перед decide загружает текущие count/sum через query-порт, передаёт в команду. Агрегат вычисляет новые значения и включает их в событие.

### Редактирование — только до публикации
Пока отзыв в статусе `pending`, можно изменить текст и рейтинг. После `published` — нельзя (иначе ломается модерация и рейтинг).

### Оспаривание (Dispute)
Продавец может оспорить опубликованный отзыв. Флоу:
- `published` → продавец вызывает `dispute` с причиной → `disputed` (отзыв скрыт из витрины)
- Kafka-событие `review.deleted` отправляется (рейтинг пересчитывается без этого отзыва)
- Модератор разрешает спор:
  - `resolve-dispute(uphold)` → отзыв восстанавливается в `published`, Kafka `review.created`
  - `resolve-dispute(remove)` → отзыв переходит в `deleted` (окончательно)
- Оспорить можно только один раз (нельзя зациклить dispute → uphold → dispute)

---

## ReviewTarget (уже в kernel)

```typescript
// src/kernel/domain/events/review.events.ts — уже существует
type ReviewTarget =
  | { targetType: 'item'; itemId: ItemId }
  | { targetType: 'organization'; organizationId: OrganizationId };
```

---

## Домен

### State

```typescript
type ReviewStatus = 'pending' | 'published' | 'disputed' | 'deleted';

type ReviewState = EntityState<{
  reviewId: ReviewId;
  authorId: UserId;
  target: ReviewTarget;
  organizationId: OrganizationId; // владелец item/org — для фильтрации и прав
  rating: Rating;            // value object, 0.5–5 с шагом 0.5
  text: string | null;       // текст необязателен
  status: ReviewStatus;
  replyText: string | null;
  repliedBy: UserId | null;
  repliedAt: Date | null;
  disputeReason: string | null;
  disputedBy: UserId | null;
  disputedAt: Date | null;
  wasDisputed: boolean;       // true после первого dispute — блокирует повторное
  createdAt: Date;
  updatedAt: Date;
}>;
```

### Commands

| Command | Описание |
|---------|----------|
| `CreateReview` | reviewId, authorId, target, organizationId, rating, text, now, currentCount, currentSum |
| `EditReview` | rating?, text?, now |
| `ApproveReview` | approvedBy, now, currentCount, currentSum |
| `RejectReview` | rejectedBy, reason, now |
| `DeleteReview` | deletedBy, now, currentCount, currentSum |
| `ReplyToReview` | repliedBy, replyText, now |
| `DisputeReview` | disputedBy, reason, now, currentCount, currentSum |
| `ResolveDispute` | resolvedBy, resolution ('uphold' \| 'remove'), now, currentCount, currentSum |

### Events (доменные)

| Event | Когда |
|-------|-------|
| `review.created` | Создан черновик (pending) или сразу опубликован (rating >= 4) |
| `review.edited` | Изменён pending-отзыв |
| `review.approved` | Модератор одобрил pending-отзыв |
| `review.rejected` | Модератор отклонил |
| `review.deleted` | Автор или модератор удалил |
| `review.replied` | Владелец организации ответил |
| `review.disputed` | Продавец оспорил отзыв (скрыт из витрины) |
| `review.dispute-upheld` | Модератор восстановил отзыв |
| `review.dispute-removed` | Модератор подтвердил удаление по спору |

### Логика decide

```
create:
  → rating >= 4 → status = 'published', emit review.created (с newRating/newReviewCount)
  → rating < 4  → status = 'pending', emit review.created (без интеграционного события)

edit:
  → только если status = 'pending'
  → обновляет rating/text
  → если новый rating >= 4 → status = 'published' (автопубликация)

approve:
  → только если status = 'pending'
  → status = 'published', emit review.approved (с newRating/newReviewCount)

reject:
  → только если status = 'pending'
  → status = 'deleted'

delete:
  → только если status = 'published'
  → status = 'deleted', emit review.deleted (с newRating/newReviewCount)

reply:
  → только если status = 'published' и replyText = null
  → устанавливает replyText, repliedBy, repliedAt

dispute:
  → только если status = 'published' и wasDisputed = false
  → status = 'disputed', wasDisputed = true
  → Kafka review.deleted (рейтинг пересчитывается без этого отзыва)

resolve-dispute (uphold):
  → только если status = 'disputed'
  → status = 'published'
  → Kafka review.created (рейтинг возвращается)

resolve-dispute (remove):
  → только если status = 'disputed'
  → status = 'deleted'
```

### Value Objects

```typescript
// domain/vo/rating.ts
type Rating = number & { readonly __brand: 'Rating' };
// валидация: 0.5 <= value <= 5, шаг 0.5
```

### Errors

| Error | Когда |
|-------|-------|
| `ReviewAlreadyExistsError` | Дубль (userId, target) — в interactor |
| `ReviewNotPendingError` | edit/approve/reject не-pending отзыва |
| `ReviewNotPublishedError` | delete/reply/dispute не-published отзыва |
| `ReviewAlreadyDisputedError` | Повторное оспаривание (wasDisputed = true) |
| `ReviewNotDisputedError` | resolve-dispute не-disputed отзыва |
| `ReviewAlreadyRepliedError` | Повторный ответ |
| `InvalidRatingError` | Невалидный рейтинг |
| `CannotReviewOwnItemError` | Автор отзыва = владелец item/org |

---

## Application

### Ports

```typescript
// application/ports.ts
abstract class ReviewRepository {
  abstract findById(tx, reviewId: ReviewId): Promise<ReviewState | null>;
  abstract save(tx, state: ReviewState): Promise<void>;
}

abstract class ReviewQueryPort {
  abstract findByAuthorAndTarget(tx, authorId: UserId, target: ReviewTarget): Promise<ReviewId | null>;
  abstract getTargetStats(tx, target: ReviewTarget): Promise<{ count: number; sum: number }>;
}
```

### Interactors

| Interactor | Описание |
|------------|----------|
| `CreateReviewInteractor` | Проверяет уникальность (userId, target), загружает stats, вызывает decide, сохраняет, публикует Kafka если published |
| `EditReviewInteractor` | Загружает review, вызывает decide, если автопубликация — публикует Kafka |
| `ApproveReviewInteractor` | Модератор одобряет pending-отзыв, публикует Kafka |
| `RejectReviewInteractor` | Модератор отклоняет |
| `DeleteReviewInteractor` | Удаление published-отзыва, публикует Kafka с пересчитанным рейтингом |
| `ReplyToReviewInteractor` | Владелец организации отвечает на отзыв |
| `DisputeReviewInteractor` | Продавец оспаривает отзыв, отзыв скрывается, Kafka review.deleted |
| `ResolveDisputeInteractor` | Модератор разрешает спор: uphold (восстановить) или remove (удалить) |

### Queries

| Query | Описание |
|-------|----------|
| `GetReviewsByTargetQuery` | Список отзывов по item/org с пагинацией. Возвращает published + pending автора (если `callerUserId` передан и совпадает с `authorId`). Pending-отзыв автора помечается флагом `isMine: true, isPending: true` |
| `GetReviewByIdQuery` | Один отзыв по ID (для тикет-системы) |
| `GetReviewsByIdsQuery` | Пакетная загрузка по массиву ID (для тикет-системы) |
| `GetOrganizationReviewsQuery` | Отзывы на все items/org конкретной организации |
| `GetMyReviewsQuery` | Отзывы текущего пользователя |

---

## Adapters

### HTTP

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/reviews` | POST | Создать отзыв |
| `/reviews/:id` | PATCH | Редактировать (pending) |
| `/reviews/:id` | DELETE | Удалить |
| `/reviews/:id/approve` | POST | Модератор одобряет (вызывается из тикет-системы) |
| `/reviews/:id/reject` | POST | Модератор отклоняет (вызывается из тикет-системы) |
| `/reviews/:id/reply` | POST | Ответ владельца |
| `/reviews/:id/dispute` | POST | Продавец оспаривает |
| `/reviews/:id/resolve-dispute` | POST | Модератор разрешает спор (вызывается из тикет-системы) |
| `/reviews?targetType=item&targetId=xxx` | GET | Список отзывов сущности (published + pending автора) |
| `/reviews/:id` | GET | Один отзыв по ID (для тикет-системы) |
| `/reviews/by-ids` | POST | Пакетная загрузка по массиву ID (для тикет-системы) |
| `/reviews/my` | GET | Мои отзывы |
| `/reviews/organization/:orgId` | GET | Отзывы на организацию и её items |

### DB

Таблица `reviews`:

| Колонка | Тип | Описание |
|---------|-----|----------|
| review_id | uuid PK | |
| author_id | uuid FK | |
| target_type | text | 'item' \| 'organization' |
| target_id | uuid | itemId или organizationId |
| organization_id | uuid | владелец target — для фильтрации |
| rating | real | 0.5–5, шаг 0.5 |
| text | text nullable | |
| status | text | 'pending' \| 'published' \| 'disputed' \| 'deleted' |
| reply_text | text nullable | |
| replied_by | uuid nullable | |
| replied_at | timestamptz nullable | |
| dispute_reason | text nullable | |
| disputed_by | uuid nullable | |
| disputed_at | timestamptz nullable | |
| was_disputed | boolean | default false |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Индексы:
- `UNIQUE (author_id, target_type, target_id) WHERE status NOT IN ('deleted', 'rejected')` — один активный отзыв
- `(target_type, target_id, status)` — выборка отзывов по сущности
- `(organization_id, status)` — отзывы по организации
- `(author_id, target_type, target_id)` — быстрый поиск pending-отзыва автора при выводе списка

### Kafka

Publisher отправляет в `review.streaming` (контракт уже существует) при:
- `create` с rating >= 4 → `review.created`
- `approve` → `review.created`
- `edit` с автопубликацией → `review.created`
- `delete` → `review.deleted`
- `dispute` → `review.deleted` (отзыв скрыт — рейтинг пересчитывается)
- `resolve-dispute(uphold)` → `review.created` (отзыв восстановлен)
- `resolve-dispute(remove)` — ничего (уже был удалён при dispute)

Discovery уже слушает этот топик и обновляет виджеты `item-review` / `owner-review`.

---

## Структура файлов

```
src/features/reviews/
  domain/
    aggregates/review/
      state.ts
      commands.ts
      events.ts
      entity.ts
      entity.spec.ts
      errors.ts
    vo/
      rating.ts

  application/
    ports.ts
    use-cases/
      create-review/
        create-review.interactor.ts
        create-review.request.ts
      edit-review/
        edit-review.interactor.ts
        edit-review.request.ts
      approve-review/
        approve-review.interactor.ts
      reject-review/
        reject-review.interactor.ts
      delete-review/
        delete-review.interactor.ts
      reply-to-review/
        reply-to-review.interactor.ts
      dispute-review/
        dispute-review.interactor.ts
      resolve-dispute/
        resolve-dispute.interactor.ts
    queries/
      get-reviews-by-target.query.ts
      get-review-by-id.query.ts
      get-reviews-by-ids.query.ts
      get-organization-reviews.query.ts
      get-my-reviews.query.ts

  adapters/
    http/
      review.controller.ts
      review-moderation.controller.ts
      dto/
        create-review.request.ts
        edit-review.request.ts
        reply-to-review.request.ts
        dispute-review.request.ts
        resolve-dispute.request.ts
        review.response.ts
    db/
      schema.ts
      repositories/
        review.repository.ts
      queries/
        review.query.ts
    kafka/
      review.publisher.ts

  reviews.module.ts
```

---

## Kernel — изменения

- Добавить `ReviewId` в `src/kernel/domain/ids.ts`
- Событие `review.replied` — добавить в `review.events.ts` если Discovery нужно показывать ответы (будущее)

---

## Задачи

### Фаза 1 — Domain

- [ ] **1.1** Добавить `ReviewId` в kernel ids
- [ ] **1.2** Создать VO `Rating` (валидация 0.5–5, шаг 0.5)
- [ ] **1.3** Определить `ReviewState`
- [ ] **1.4** Определить commands
- [ ] **1.5** Определить domain events
- [ ] **1.6** Определить errors
- [ ] **1.7** Реализовать `ReviewEntity` (decide + apply)
- [ ] **1.8** Unit-тесты на entity

### Фаза 2 — Application

- [ ] **2.1** Определить порты (ReviewRepository, ReviewQueryPort)
- [ ] **2.2** `CreateReviewInteractor` — с проверкой уникальности и подсчётом stats
- [ ] **2.3** `EditReviewInteractor` — с автопубликацией при rating >= 4
- [ ] **2.4** `ApproveReviewInteractor`
- [ ] **2.5** `RejectReviewInteractor`
- [ ] **2.6** `DeleteReviewInteractor`
- [ ] **2.7** `ReplyToReviewInteractor`
- [ ] **2.8** `DisputeReviewInteractor`
- [ ] **2.9** `ResolveDisputeInteractor`

### Фаза 3 — Adapters (DB)

- [ ] **3.1** Drizzle-схема таблицы `reviews`
- [ ] **3.2** Генерация миграции (удалить drizzle/, сгенерировать заново)
- [ ] **3.3** `DrizzleReviewRepository` (save, findById)
- [ ] **3.4** `DrizzleReviewQuery` (findByAuthorAndTarget, getTargetStats, списки)

### Фаза 4 — Adapters (HTTP + Kafka)

- [ ] **4.1** DTO: request/response
- [ ] **4.2** `ReviewController` — CRUD endpoints
- [ ] **4.3** `ReviewModerationController` — approve/reject/pending list
- [ ] **4.4** `ReviewKafkaPublisher` — outbox → `review.streaming`
- [ ] **4.5** `ReviewsModule` — регистрация провайдеров

### Фаза 5 — E2E тесты

- [ ] **5.1** Создание отзыва с rating >= 4 → сразу published
- [ ] **5.2** Создание отзыва с rating < 4 → pending
- [ ] **5.3** Дубль (userId, target) → ошибка
- [ ] **5.4** Редактирование pending-отзыва, автопубликация при повышении рейтинга
- [ ] **5.5** Approve / reject модератором
- [ ] **5.6** Удаление published-отзыва
- [ ] **5.7** Ответ владельца на отзыв
- [ ] **5.8** Оспаривание: dispute → отзыв скрыт, рейтинг пересчитан
- [ ] **5.9** Resolve dispute (uphold) → отзыв восстановлен
- [ ] **5.10** Resolve dispute (remove) → отзыв удалён окончательно
- [ ] **5.11** Повторное оспаривание после uphold → ошибка
- [ ] **5.12** Получение списка отзывов по target с пагинацией

---

## Связь с другими фичами

```
Review feature (write)
  │
  ├── Kafka: review.streaming ──→ Discovery (read)
  │                                 ├── обновляет item-review виджет
  │                                 └── обновляет owner-review виджет
  │
  └── Зависит от:
      ├── Item Showcase (#2) — target.itemId должен существовать
      └── IDP — authorId = текущий пользователь
```

Feature никогда не импортирует другую feature. Коммуникация — через kernel events и Kafka.

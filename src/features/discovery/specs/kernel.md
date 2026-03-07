# Kernel

Этот модуль — **read model**. Все данные поступают через **Kafka** (товары, типы, категории, владельцы, отзывы и т.д.). Модуль не ходит в другие сервисы по API.

Eventual consistency допустима, задержка не критична.

Обработка событий должна быть **идемпотентной** (Kafka — at-least-once доставка).

Streaming события содержат информацию о:

1. Дереве категорий с атрибутами
2. Товарах с виджетами
3. Типах товаров
4. Владельцах (организации + пользователи)
5. Отзывах и рейтингах
6. Взаимодействиях пользователей (view, click, like, unlike, purchase, booking)

## Kafka Event Format

Все события приходят в общем envelope-формате:

| Поле | Тип | Описание |
|------|-----|----------|
| `eventId` | string | UUID, для идемпотентности |
| `eventType` | string | напр. `item.published`, `organization.published` |
| `aggregateId` | string | ID сущности-источника |
| `aggregateType` | string | `item` / `category` / `item-type` / `organization` / `user` / `review` / `interaction` |
| `version` | number | версия агрегата (для ordering) |
| `timestamp` | Date | |
| `payload` | T | |

**Типы событий:**

| aggregateType | eventType | Описание |
|--------------|-----------|----------|
| `item` | `item.published` | Публикация товара с виджетами (`republished: true` = обновление) |
| `item` | `item.unpublished` | Снятие товара с публикации |
| `category` | `category.published` | Публикация категории с атрибутами (`republished: true` = обновление) |
| `category` | `category.unpublished` | Снятие категории с публикации |
| `item-type` | `item-type.created` | Новый тип товара |
| `item-type` | `item-type.updated` | Обновление типа |
| `organization` | `organization.published` | Публикация организации (`republished: true` = обновление данных) |
| `organization` | `organization.unpublished` | Снятие организации с публикации |
| `user` | `user.created` | Новый пользователь |
| `user` | `user.updated` | Обновление данных пользователя |
| `user` | `user.deleted` | Удаление пользователя |
| `review` | `review.created` | Новый отзыв → pre-computed `newRating` + `newReviewCount` |
| `review` | `review.deleted` | Удаление отзыва → пересчёт рейтинга |
| `interaction` | `interaction.recorded` | Взаимодействие пользователя с товаром |

Виджеты приходят **внутри** payload события `item.published` как массив `widgets[]`. Типы виджетов определены в [@/kernel/domain/vo/widget.ts](../../../kernel/domain/vo/widget.ts).

**Идемпотентность:** обработчики используют `eventId` для дедупликации через `IdempotencyPort` (таблица `processed_events` с TTL).

## Синхронизация в Gorse и Meilisearch

При проекции Kafka-события в PostgreSQL — **синхронно в том же обработчике** данные отправляются в Gorse и Meilisearch:

1. Проекция в PG
2. Upsert/delete в Gorse (item labels: cityId, ageGroup, categoryIds, typeId)
3. Upsert/delete в Meilisearch (денормализованные поля для полнотекстового поиска)

**При ошибке синхронизации** (Gorse/Meilisearch недоступен): событие отправляется в DLQ с указанием, какой шаг упал. При retry DLQ-процессор выполняет только упавший шаг (PG уже записан).

**interaction** события: отправляются только в Gorse (feedback). `like` дополнительно сохраняется в PG (таблица `user_likes`) для GetLikedItems. `unlike` удаляет лайк из PG и feedback `like` из Gorse.

## Обновление данных владельца

При получении `organization.published` с `republished: true`:
1. Обновить `OwnerReadModel` в PG
2. Обновить денормализованные данные owner во **всех** `ItemReadModel` этого владельца (batch update по `organizationId`)
3. Обновить данные в Meilisearch для всех товаров владельца

При получении `organization.unpublished`:
1. Удалить `OwnerReadModel` из PG
2. Удалить все `ItemReadModel` владельца
3. Удалить из Gorse и Meilisearch все товары владельца

## Cold start пользователя

Для анонимных и авторизованных пользователей без истории взаимодействий Gorse возвращает **популярные** товары. Отдельного onboarding'а нет.

# Adapters

## PostgreSQL

Основное хранилище read model. Товары, категории, типы, владельцы, отзывы — денормализованные данные для быстрого чтения и фильтрации в каталоге и рекомендациях. Без foreign key constraints — неконсистентности обрабатываются на чтении. Hard delete при удалении сущностей.

Дополнительные таблицы:
- `user_likes` — лайки пользователей (`userId`, `itemId`, `likedAt`). Используется для GetLikedItems.
- `dead_letter_events` — DLQ для событий с ошибками проекции.
- `processed_events` — таблица для идемпотентности (`eventId`, `processedAt`, TTL).

## Meilisearch

Полнотекстовый поиск и динамические фильтры. Синхронизация — синхронно при проекции Kafka-событий (через `MeilisearchSyncPort`). При `organization.published` с `republished: true` — batch-обновление всех товаров владельца в Meilisearch.

## Gorse

https://github.com/gorse-io/gorse

Рекомендательный движок. Синхронизация items — синхронно при проекции (через `GorseSyncPort`). User feedback (view, click, like, purchase, booking) отправляется при обработке `interaction.recorded` событий. `unlike` удаляет feedback `like`. Item labels в Gorse: `cityId`, `ageGroup`, `categoryIds[]`, `typeId`.

Проекция лайков в PG осуществляется через отдельный топик `like.streaming` (не через `interaction.streaming`), что обеспечивает надёжную доставку событий like/unlike для `user_likes`.

## Redis

Кэш ранжированных списков для cursor-пагинации по категориям (`RankedListCachePort`). TTL ~5 мин.

## Dead Letter Queue (DLQ)

Если при проекции события не найдена зависимая сущность (напр. товар ссылается на категорию, которая ещё не пришла) — событие отправляется в **dead letter queue (DLQ)**.

**Хранилище DLQ:** таблица в PostgreSQL (`dead_letter_events`):

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | PK |
| `eventType` | string | тип события |
| `payload` | JsonB | полный payload события |
| `error` | string | причина ошибки |
| `retryCount` | number | текущая попытка |
| `nextRetryAt` | Date | когда следующая попытка |
| `createdAt` | Date | |

**Стратегия retry:**
- Экспоненциальный backoff: 10с → 30с → 1мин → 2мин → 5мин (макс. интервал)
- Максимум **10 попыток**
- После исчерпания попыток: событие остаётся в таблице со статусом `failed`, отправляется алерт для ручного разбора
- DLQ-процессор работает по cron (каждые 10 секунд), выбирает события с `nextRetryAt <= now()` и `retryCount < 10`

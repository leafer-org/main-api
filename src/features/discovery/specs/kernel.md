# Kernel

Этот модуль — **read model**. Все данные поступают через **Kafka** (товары, типы, категории, владельцы, отзывы и т.д.). Модуль не ходит в другие сервисы по API.

Eventual consistency допустима, задержка не критична.

Обработка событий должна быть **идемпотентной** (Kafka — at-least-once доставка).

Streaming события содержат информацию о:

1. Дереве категорий с атрибутами
2. Товарах с виджетами
3. Типах товаров
4. Владельцах
5. Отзывах и рейтингах
6. Взаимодействиях пользователей (view, click, like, purchase, booking)

## Kafka Event Format

Все события приходят в общем envelope-формате:

| Поле | Тип | Описание |
|------|-----|----------|
| `eventId` | string | UUID, для идемпотентности |
| `eventType` | string | напр. `item.created`, `owner.updated` |
| `aggregateId` | string | ID сущности-источника |
| `aggregateType` | string | `item` / `category` / `product-type` / `owner` / `review` / `user-interaction` |
| `version` | number | версия агрегата (для ordering) |
| `timestamp` | Date | |
| `payload` | T | |

**Типы событий:**

| aggregateType | eventType | Описание |
|--------------|-----------|----------|
| `item` | `item.created` | Новый товар с виджетами |
| `item` | `item.updated` | Обновление товара / виджетов |
| `item` | `item.deleted` | Удаление товара |
| `category` | `category.created` | Новая категория |
| `category` | `category.updated` | Обновление (имя, parentId, allowedTypes, атрибуты) |
| `category` | `category.deleted` | Удаление категории |
| `product-type` | `product-type.created` | Новый тип товара |
| `product-type` | `product-type.updated` | Обновление типа |
| `owner` | `owner.updated` | Обновление данных владельца (имя, аватар, рейтинг) |
| `review` | `review.created` | Новый отзыв → пересчёт рейтинга |
| `review` | `review.deleted` | Удаление отзыва → пересчёт рейтинга |
| `user-interaction` | `interaction.recorded` | Взаимодействие пользователя с товаром |

Виджеты приходят **внутри** payload события `item.created` / `item.updated` как массив `widgets[]`.

**Идемпотентность:** обработчики используют `eventId` для дедупликации (таблица `processed_events` с TTL). Если `version` события ≤ текущей версии read model — событие пропускается.

## Синхронизация в Gorse и Meilisearch

При проекции Kafka-события в PostgreSQL — **синхронно в том же обработчике** данные отправляются в Gorse и Meilisearch:

1. Проекция в PG
2. Upsert/delete в Gorse (item labels: cityId, ageGroup, categoryIds, typeId)
3. Upsert/delete в Meilisearch (денормализованные поля для полнотекстового поиска)

**При ошибке синхронизации** (Gorse/Meilisearch недоступен): событие отправляется в DLQ с указанием, какой шаг упал. При retry DLQ-процессор выполняет только упавший шаг (PG уже записан).

**user-interaction** события: отправляются только в Gorse (feedback). `like` дополнительно сохраняется в PG (таблица `user_likes`) для GetLikedItems.

## Обновление данных владельца

При получении `owner.updated`:
1. Обновить `OwnerReadModel` в PG
2. Обновить денормализованные данные owner во **всех** `ItemReadModel` этого владельца (batch update по `ownerId`)
3. Обновить данные в Meilisearch для всех товаров владельца

## Cold start пользователя

Для анонимных и авторизованных пользователей без истории взаимодействий Gorse возвращает **популярные** товары. Отдельного onboarding'а нет.


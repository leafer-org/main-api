# Feature: Discovery

## Business Context

Цель этого домена реализовать поиск пользователем нужного продукта.

Мы здесь не реализуем создание услуги и других сущностей. Только выдаём данные в нужном формате

Основные термины:

**Товар** - то что мы ищем. Каждый Товар имеет тип. В зависимости от типа у него может быть разный набор Виджетов. 

**Тип** - Названиние (будет в интерфейсе) id (айдишник на который ссылаюсь в коде) + набор доступных типов виджетов + обязательные виджеты 

**Виджеты** - набор данных который описывает возможности Товара.

Актуальные виждеты: 
"Базовая информация": описывает название описание кратинку

"Возростная группа": дети взрослые все

"Локация" описывает город и положение

"Оплата": какая стратегия оплаты + данные (разовая оплата /  бесплатно / подписка)

"Категория" в какой категории находится Товар + занчения атрибутов катеогории

"Владелец" организация или обычный пользователь

"Отзывы товара" отзывы и рейтинг товара

"Отзывы организации" отзывы и рейтинг владельца-организации

"ДатаВремя проведения" конкретная дата и время проведения (одноразовое событие или конкретный сеанс)

"Расписание" регулярное расписание проведения (напр. каждый вторник в 18:00, пн-пт с 10 до 20)

**Категория** может иметь детей (неограниченная вложенность, создаются через админку). Товар выводится как в своей категории, так и в родительских. Товар может принадлежать нескольким категориям.

Категория ограничивает набор допустимых **Типов** товаров. Один Тип может быть допустим в нескольких категориях. Если товар принадлежит нескольким категориям, все они должны допускать его тип.

У категории могут быть **Атрибуты** — набор данных, которые нужно указать в Товаре при создании. Атрибуты наследуются от родительских категорий вниз по дереву. Атрибуты могут быть необязательными. Атрибут накладывает ограничения только на этапе создания товара и определяет доступные фильтры. Атрибут хранит схему для поддержки отображения.

Типы атрибутов:
- **enum** — выбор одного значения из списка (напр. "Уровень": начинающий / средний / продвинутый)
- **multi-enum** — выбор нескольких значений из списка (напр. "Языки": русский, английский)
- **number-range** — числовое значение с мин/макс (напр. "Длительность (мин)": 30–120)
- **boolean** — да/нет (напр. "Есть парковка")

На основе значений атрибутов строятся фильтры.

**Виджеты** — набор виджетов определяется разработчиком в коде. Новые типы виджетов будут постоянно добавляться. При создании товара указываются конкретные виджеты. Каждый виджет имеет представление данных для: вывода в списках и просмотра товара (просмотр товара — не этот модуль). Через Kafka приходят сырые данные виджета, Discovery в коде определяет проекцию для view (toListView).

**Типы** — создаются динамически через админку.

## Поиск и выдача

Четыре режима выдачи:

1. **Общая лента рекомендаций** — персонализированная лента по всему каталогу. Пре-фильтрация: город + возрастная зона. Discovery формирует набор кандидатов → Gorse ранжирует → Discovery выполняет пост-фильтрацию → возвращает клиенту. Фильтры в UI не нужны. **Fallback при недоступности Gorse:** этап рекомендаций пропускается, кандидаты сразу идут на пост-ранкинг (порядок по базовому скору: свежесть × популярность).

2. **Каталог (страница категории)** — фильтр по категории + атрибутам категории + параметрам типов. Набор фильтров определяется категорией. Результаты фильтрации ранжируются персонально через Gorse: Discovery формирует кандидатов (город + возрастная зона + категория + фильтры) → Gorse ранжирует → пост-фильтрация → клиент. **Fallback при недоступности Gorse:** кандидаты идут на пост-ранкинг в порядке базового скора.

3. **Полнотекстовый поиск** — поиск по названию, описанию, владельцу, локации, категории. Движок — **Meilisearch**. Динамические фильтры — показываем только те фильтры, для которых есть значения в текущей выборке.

4. **Лайкнутые товары** — список товаров, которые пользователь отметил лайком. Поиск по названию + сортировка по времени лайка (новые сначала). Cursor-based пагинация.

**Возрастная группа** — глобальный фильтр, разделяет сайт на взрослую и детскую зону. Более детальные возрасты могут быть в атрибутах категорий.

Фильтрация по дате: "что есть на эту неделю / сегодня". Фильтрация по дню недели / времени суток (для расписания).

Гео-фильтрация: по городу и по радиусу от точки ("в 5 км от меня").

Пагинация — **cursor-based**.

Сортировка по умолчанию — персональная (через Gorse). Пользователь может переключить на явную сортировку: по цене, по рейтингу и т.д.

Формат ответа (карточка товара) зависит от типа товара и его виджетов. Discovery отдаёт только списки/ленту, детальная страница товара — другой сервис.


## DOMAIN

### Read models

#### [ItemReadModel](domain/read-models/item.read-model.ts)

Основная проекция товара. Денормализованные данные извлекаются из виджетов при проекции события. Все блоки виджетов optional — зависят от типа товара и наличия виджета.

#### [CategoryReadModel](domain/read-models/category.read-model.ts)

Хранит узел дерева категорий. `ancestorIds` — путь от корня для эффективного показа товара в родительских категориях.

#### [CategoryListReadModel](domain/read-models/category-list.read-model.ts)

Список дочерних категорий для каталога. Запрос: по parentCategoryId (null = корневые).

#### [CategoryFiltersReadModel](domain/read-models/category-filters.read-model.ts)

Доступные фильтры для страницы категории. Строится на основе атрибутов категории (+ унаследованных) и параметров допустимых типов.

#### [AttributeReadModel](domain/read-models/attribute.read-model.ts)

Атрибут категории. Наследуется дочерними категориями. Определяет фильтры в каталоге.

#### [ProductTypeReadModel](domain/read-models/product-type.read-model.ts)

Тип товара. Определяет доступные и обязательные виджеты.

#### [OwnerReadModel](domain/read-models/owner.read-model.ts)

Отдельная read model владельца — нужна для обновления данных владельца (рейтинг, имя) независимо от товаров.

#### Связи между read models

```
ItemReadModel
  ├── typeId                 → ProductTypeReadModel
  ├── category.categoryIds[] → CategoryReadModel
  ├── owner.ownerId          → OwnerReadModel (данные денормализованы в item)
  └── category.attributeValues[].attributeId → AttributeReadModel

CategoryReadModel
  ├── parentCategoryId       → CategoryReadModel (self)
  └── allowedTypeIds[]       → ProductTypeReadModel

CategoryListReadModel         — проекция CategoryReadModel для UI каталога
CategoryFiltersReadModel      — собирается из AttributeReadModel + ProductTypeReadModel + ItemReadModel

AttributeReadModel
  └── categoryId             → CategoryReadModel
```

Связи логические (без FK constraints в PG). При обновлении OwnerReadModel — данные owner во всех связанных ItemReadModel обновляются через обработку Kafka-события владельца (денормализация).

#### User Interaction Events

Доменные события взаимодействия пользователя с товаром. Используются для обучения Gorse и хранения лайков. Источник событий будет определён позже — здесь описан формат.

```ts
type InteractionType = 'view' | 'click' | 'like' | 'purchase' | 'booking';

type UserInteractionEvent = {
  userId: UserId;
  itemId: ServiceId;
  interactionType: InteractionType;
  timestamp: Date;
};
```

**Веса для Gorse** (влияние на рекомендации):
| Тип | Вес | Описание |
|------|-----|----------|
| `view` | 1 | Пользователь открыл детальную страницу товара |
| `click` | 2 | Клик на карточку в списке / ленте |
| `like` | 4 | Лайк товара (сохранение) |
| `purchase` | 8 | Покупка товара |
| `booking` | 8 | Запись на услугу |

**Like** дополнительно сохраняется в read model для отображения лайкнутых товаров (GetLikedItems).

#### Политика обработки неверного порядка событий (DLQ)

Если при проекции события не найдена зависимая сущность (напр. товар ссылается на категорию, которая ещё не пришла) — событие отправляется в **dead letter queue (DLQ)**.

**Хранилище DLQ:** таблица в PostgreSQL (`dead_letter_events`):
```ts
{
  id: string;               // PK
  eventType: string;        // тип события
  payload: JsonB;           // полный payload события
  error: string;            // причина ошибки
  retryCount: number;       // текущая попытка
  nextRetryAt: Date;        // когда следующая попытка
  createdAt: Date;
}
```

**Стратегия retry:**
- Экспоненциальный backoff: 10с → 30с → 1мин → 2мин → 5мин (макс. интервал)
- Максимум **10 попыток**
- После исчерпания попыток: событие остаётся в таблице со статусом `failed`, отправляется алерт для ручного разбора
- DLQ-процессор работает по cron (каждые 10 секунд), выбирает события с `nextRetryAt <= now()` и `retryCount < 10`

### Aggregates

Модуль — read model, агрегатов нет.

## Kernel

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

### Kafka Event Format

Все события приходят в общем envelope-формате:

```ts
type KafkaEventEnvelope<T = unknown> = {
  eventId: string;          // UUID, для идемпотентности
  eventType: string;        // напр. 'item.created', 'owner.updated'
  aggregateId: string;      // ID сущности-источника
  aggregateType: string;    // 'item' | 'category' | 'product-type' | 'owner' | 'review' | 'user-interaction'
  version: number;          // версия агрегата (для ordering)
  timestamp: Date;
  payload: T;
};
```

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

### Синхронизация в Gorse и Meilisearch

При проекции Kafka-события в PostgreSQL — **синхронно в том же обработчике** данные отправляются в Gorse и Meilisearch:

1. Проекция в PG
2. Upsert/delete в Gorse (item labels: cityId, ageGroup, categoryIds, typeId)
3. Upsert/delete в Meilisearch (денормализованные поля для полнотекстового поиска)

**При ошибке синхронизации** (Gorse/Meilisearch недоступен): событие отправляется в DLQ с указанием, какой шаг упал. При retry DLQ-процессор выполняет только упавший шаг (PG уже записан).

**user-interaction** события: отправляются только в Gorse (feedback). `like` дополнительно сохраняется в PG (таблица `user_likes`) для GetLikedItems.

### Обновление данных владельца

При получении `owner.updated`:
1. Обновить `OwnerReadModel` в PG
2. Обновить денормализованные данные owner во **всех** `ItemReadModel` этого владельца (batch update по `ownerId`)
3. Обновить данные в Meilisearch для всех товаров владельца

### Cold start пользователя

Для анонимных и авторизованных пользователей без истории взаимодействий Gorse возвращает **популярные** товары. Отдельного onboarding'а нет.

## APPLICATION

Модуль — **read-only**. Все данные поступают через Kafka. Единственная запись — сохранение `like` в PG при обработке `interaction.recorded` события.

### Queries

#### GetFeed

Персонализированная лента рекомендаций по всему каталогу.

**Input:**
```ts
{
  userId?: UserId;        // null для анонимных → Gorse вернёт популярное
  cityId: string;
  ageGroup: AgeGroup;
  cursor?: string;
  limit: number;
}
```

**Output:** `{ items: ItemListView[], nextCursor: string | null }`

**Flow:**
1. Параллельно:
   - `RecommendationService.recommend({ userId, cityId, ageGroup, offset, limit: limit × 2 })` → `ServiceId[]`
     Gorse native recommend — запрашиваем с запасом ×2 для компенсации потерь на пост-ранкинге.
     **Fallback:** если Gorse недоступен — пропускаем этот шаг, используем только new seller items + популярные из PG.
   - `NewSellerItemsPort.findNewSellerItems({ cityId, ageGroup, limit: N })` → `ServiceId[]`
     Гарантированные слоты для товаров новых продавцов (cold start injection).
2. Merge списков: рекомендации + new seller items (дедупликация). При fallback: `ItemQueryPort.findPopular({ cityId, ageGroup, limit: limit × 2 })`.
3. `ItemQueryPort.findByIds(mergedIds)` → `ItemReadModel[]`
   Порт фильтрует просроченные товары на уровне БД (`next_event_date > now() OR has_schedule = true`).
4. `PostRankingService.apply(items, { userId })` → переупорядоченные items
5. Взять первые `limit` → трансформация в `ItemListView[]`

> Без фильтров в UI. Пре-фильтры (город, возрастная зона) задаются как item labels в Gorse.

---

#### GetCategoryItems

Товары в категории с фильтрами и сортировкой.

**Input:**
```ts
{
  userId?: UserId;
  categoryId: CategoryId;
  cityId: string;
  ageGroup: AgeGroup;
  filters: CategoryItemFilters;
  sort: SortOption;       // default 'personal'
  cursor?: string;
  limit: number;
}
```

**CategoryItemFilters:**
```ts
{
  attributeValues?: { attributeId: AttributeId; value: string }[];
  typeIds?: TypeId[];
  priceRange?: { min?: number; max?: number };
  minRating?: number;
  geoRadius?: { lat: number; lng: number; radiusKm: number };
  dateRange?: { from: Date; to: Date };
  scheduleDayOfWeek?: number;
  scheduleTimeOfDay?: { from: string; to: string };
}
```

**SortOption:** `'personal' | 'price-asc' | 'price-desc' | 'rating-desc' | 'newest'`

**Output:** `{ items: ItemListView[], nextCursor: string | null }`

**Flow (sort = `personal`):**
1. Проверить `RankedListCachePort.get(cacheKey)` — если есть кэш, перейти к шагу 6.
2. `ItemCandidatesPort.findCategoryCandidates({ categoryId, cityId, ageGroup, filters, cap })` → `PostRankingCandidate[]`
   Возвращает top-N кандидатов (capping) с метаданными для пост-ранкинга, отсортированных по базовому скору (свежесть × популярность).
   Pre-ranking фильтры применяются на уровне SQL: просроченные товары исключены (`next_event_date > now() OR has_schedule = true`).
   New seller injection: товары новых продавцов (< 30 дней) получают boost factor в базовом скоре, гарантируя попадание в кандидаты.
3. `RecommendationService.rank({ userId, itemIds })` → `ServiceId[]`
   **Fallback:** если Gorse недоступен — пропускаем, кандидаты идут на пост-ранкинг в порядке базового скора.
4. `PostRankingService.applyToIds(rankedIds, candidates)` → переупорядоченные IDs
   Результат сохраняется в `RankedListCachePort.set(cacheKey, postRankedIds, ttl: 5 мин)`.
   `cacheKey` = hash(userId + categoryId + filters).
5. Cursor-пагинация по ранжированному списку (из кэша)
6. `ItemQueryPort.findByIds(pageIds)` → items → list views

**Cap кандидатов:**
- Значение по умолчанию: **500** — покрывает ~10 страниц по 50 товаров, что больше, чем пролистывает типичный пользователь.
- Cap — глобальная настройка (конфиг), одинаковая для всех категорий. При необходимости можно сделать per-category.
- Когда пользователь исчерпал кэшированный список (пролистал все 500) — автоматический переход на `sort = 'newest'` (SQL-пагинация без ограничения).

**Flow (sort ≠ `personal`):**
1. `ItemQueryPort.findCategoryItemsSorted({ categoryId, cityId, ageGroup, filters, sort, cursor, limit })` → items + cursor
   Сортировка и cursor-пагинация на стороне PostgreSQL.

---

#### GetCategoryFilters

Доступные фильтры для страницы категории. Набор определяется категорией: атрибуты (собственные + унаследованные) + допустимые типы + общие фильтры.

**Input:** `{ categoryId: CategoryId }`

**Output:** `CategoryFiltersReadModel`

**Flow:**
1. `CategoryFiltersQueryPort.findByCategoryId(categoryId)` → filters

---

#### GetCategoryList

Каталог категорий — список дочерних категорий с количеством товаров.

**Input:** `{ parentCategoryId: CategoryId | null }` (null = корневые)

**Output:** `CategoryListReadModel[]`

**Flow:**
1. `CategoryListQueryPort.findByParentId(parentCategoryId)` → categories

---

#### SearchItems

Полнотекстовый поиск через Meilisearch с динамическими фасетными фильтрами.

**Input:**
```ts
{
  query: string;
  cityId: string;
  ageGroup: AgeGroup;
  filters?: DynamicSearchFilters;  // фасетные фильтры из предыдущего ответа
  cursor?: string;
  limit: number;
}
```

**DynamicSearchFilters** — фильтры, показываемые только при наличии значений в текущей выборке. Структура определяется Meilisearch фасетами и может включать: категорию, атрибуты, цену, рейтинг, тип.

**Output:**
```ts
{
  items: ItemListView[];
  facets: SearchFacets;     // доступные фильтры с количеством значений
  nextCursor: string | null;
  total: number;
}
```

**Flow:**
1. `SearchPort.search({ query, cityId, ageGroup, filters, cursor, limit })` → results + facets
   Meilisearch хранит денормализованные данные товаров, возвращает list view напрямую + фасеты.

---

#### GetLikedItems

Список лайкнутых товаров пользователя с поиском по названию.

**Input:**
```ts
{
  userId: UserId;
  search?: string;          // поиск по названию товара (ILIKE)
  cursor?: string;
  limit: number;
}
```

**Output:** `{ items: LikedItemView[], nextCursor: string | null }`

**Flow:**
1. `LikedItemsQueryPort.findLikedItems({ userId, search, cursor, limit })` → liked items
   Сортировка по `likedAt DESC` (новые лайки первыми). Cursor — по `likedAt`.
   Если `search` указан — фильтрация по `title ILIKE '%search%'`.
   Просроченные товары **не исключаются** (пользователь должен видеть всё, что лайкнул).

---

### Pre-Ranking

Pre-ranking — фильтрация и injection кандидатов **до** отправки в Gorse. Цель: не тратить слоты рекомендательного движка на заведомо нерелевантные товары и гарантировать попадание важных товаров в выборку.

#### 1. Expired event removal (фильтр)

Товары с виджетом `event-date-time`, у которых все даты в прошлом — исключаются на уровне БД-запросов. Не применяется к товарам с виджетом `schedule` (регулярное расписание не просрочивается).

Реализация:
- **PostgreSQL**: условие `next_event_date > now() OR has_schedule = true` в `ItemQueryPort.findByIds`, `ItemCandidatesPort.findCategoryCandidates`, `ItemQueryPort.findCategoryItemsSorted`.
- **Gorse**: периодическое удаление просроченных items из индекса Gorse (cron или по событию обновления товара). Это снижает шум в рекомендациях и освобождает слоты.
- **Meilisearch**: аналогичная фильтрация при индексации.

#### 2. New seller injection (холодный старт продавца)

Проблема: у нового продавца нет истории взаимодействий → Gorse ранжирует его товары в хвост или не возвращает вовсе. Boost в post-ranking бесполезен, если товар не попал в кандидаты.

Реализация зависит от режима выдачи:

**GetFeed (лента):**
- Параллельно с `RecommendationService.recommend()` запрашиваем `NewSellerItemsPort.findNewSellerItems({ cityId, ageGroup, limit: N })`.
- Merge с дедупликацией перед загрузкой `ItemReadModel`.
- Условие: первый товар владельца опубликован менее 30 дней назад.

**GetCategoryItems (каталог):**
- В `ItemCandidatesPort.findCategoryCandidates` товары новых продавцов получают boost factor в базовом скоре (свежесть × популярность), гарантируя попадание в top-N (cap).
- Boost factor затухает линейно: день 1 → макс. буст, день 30 → 0.

---

### Post-Ranking

Пост-ранкинг применяется **только при sort = `personal`** (лента + категория). При явной сортировке (цена, рейтинг) пользователь ожидает точный порядок — пост-ранкинг не применяется.

`PostRankingService` — чистая доменная логика (без портов, без IO). Принимает ранжированный список, применяет правила последовательно, возвращает переупорядоченный список.

#### Правила

**1. Urgency boost (скоро закончится)**
- Условие: товар с `event-date-time` в ближайшем будущем
- Тиры: < 24ч → сильный буст, < 48ч → средний, < 7 дней → слабый
- Не применяется к `schedule`

**2. Owner diversity (разнообразие владельцев)**
- Не более 2 товаров одного владельца в окне из 5 последовательных позиций
- При нарушении — сдвигает дубль вниз до ближайшей допустимой позиции

#### Порядок применения

```
1. Urgency boost          — поднять срочные
2. Owner diversity        — разбавить владельцев
```

Порядок важен: diversity применяется последним, чтобы не дать бустам скопить товары одного владельца.

#### Метаданные для пост-ранкинга

Для ленты (GetFeed) метаданные берутся из `ItemReadModel` (уже загружен на шаге 3).

Для категории (GetCategoryItems) загрузка полных `ItemReadModel` для 500 кандидатов — дорого. Поэтому `ItemCandidatesPort.findCategoryCandidates` возвращает лёгкие `PostRankingCandidate`:

```ts
type PostRankingCandidate = {
  itemId: ServiceId;
  ownerId: OwnerId;
  nextEventDate: Date | null;    // для urgency boost
  hasSchedule: boolean;          // schedule — urgency не применяется
};
```

### Ports

#### Query Ports (read-only, без транзакций)

```ts
export abstract class ItemCandidatesPort {
  /** Top-N кандидатов для категории с метаданными для пост-ранкинга.
   *  Отсортированы по базовому скору (свежесть × популярность).
   *  cap ограничивает количество перед отправкой в Gorse.
   *  Pre-ranking: просроченные товары исключены, новые продавцы получают boost в базовом скоре. */
  public abstract findCategoryCandidates(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    cap: number;
  }): Promise<PostRankingCandidate[]>;
}

export abstract class NewSellerItemsPort {
  /** Товары новых продавцов (< 30 дней) для injection в ленту (cold start).
   *  Pre-ranking: просроченные исключены. */
  public abstract findNewSellerItems(params: {
    cityId: string;
    ageGroup: AgeGroup;
    limit: number;
  }): Promise<ServiceId[]>;
}

export abstract class ItemQueryPort {
  /** Полные данные товаров по списку ID (для обогащения после Gorse) */
  public abstract findByIds(ids: ServiceId[]): Promise<ItemReadModel[]>;

  /** Товары с сортировкой и cursor-пагинацией (без Gorse) */
  public abstract findCategoryItemsSorted(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    sort: Exclude<SortOption, 'personal'>;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ItemReadModel[]; nextCursor: string | null }>;

  /** Популярные товары (fallback при недоступности Gorse) */
  public abstract findPopular(params: {
    cityId: string;
    ageGroup: AgeGroup;
    limit: number;
  }): Promise<ItemReadModel[]>;
}

export abstract class LikedItemsQueryPort {
  /** Лайкнутые товары пользователя с поиском по названию.
   *  Сортировка: likedAt DESC. Cursor по likedAt. */
  public abstract findLikedItems(params: {
    userId: UserId;
    search?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: LikedItemView[]; nextCursor: string | null }>;
}

export abstract class CategoryListQueryPort {
  public abstract findByParentId(
    parentCategoryId: CategoryId | null,
  ): Promise<CategoryListReadModel[]>;
}

export abstract class CategoryFiltersQueryPort {
  public abstract findByCategoryId(
    categoryId: CategoryId,
  ): Promise<CategoryFiltersReadModel | null>;
}
```

#### Service Ports

```ts
export abstract class RecommendationService {
  /** Gorse native recommend: персонализированные рекомендации с пагинацией.
   *  Pre-фильтры (город, возраст) заданы как item labels в Gorse. */
  public abstract recommend(params: {
    userId?: UserId;
    cityId: string;
    ageGroup: AgeGroup;
    offset: number;
    limit: number;
  }): Promise<ServiceId[]>;

  /** Gorse re-rank: ранжирование переданного набора кандидатов */
  public abstract rank(params: {
    userId?: UserId;
    itemIds: ServiceId[];
  }): Promise<ServiceId[]>;
}

export abstract class RankedListCachePort {
  /** Кэш ранжированного списка для cursor-пагинации по категории (Redis, TTL ~5 мин) */
  public abstract get(key: string): Promise<ServiceId[] | null>;
  public abstract set(key: string, itemIds: ServiceId[], ttlMs: number): Promise<void>;
}

export abstract class SearchPort {
  /** Meilisearch: полнотекстовый поиск + фасеты */
  public abstract search(params: {
    query: string;
    cityId: string;
    ageGroup: AgeGroup;
    filters?: DynamicSearchFilters;
    cursor?: string;
    limit: number;
  }): Promise<{
    items: ItemListView[];
    facets: SearchFacets;
    nextCursor: string | null;
    total: number;
  }>;
}

export abstract class GorseSyncPort {
  /** Upsert item в Gorse с labels (cityId, ageGroup, categoryIds, typeId) */
  public abstract upsertItem(item: ItemReadModel): Promise<void>;
  /** Удалить item из Gorse */
  public abstract deleteItem(itemId: ServiceId): Promise<void>;
  /** Отправить user interaction feedback в Gorse */
  public abstract sendFeedback(event: UserInteractionEvent): Promise<void>;
}

export abstract class MeilisearchSyncPort {
  /** Upsert денормализованных данных товара для полнотекстового поиска */
  public abstract upsertItem(item: ItemReadModel): Promise<void>;
  /** Удалить item из индекса */
  public abstract deleteItem(itemId: ServiceId): Promise<void>;
  /** Batch-обновить товары владельца (после owner.updated) */
  public abstract updateOwnerItems(ownerId: OwnerId, ownerData: { name: string; avatarId: FileId | null }): Promise<void>;
}
```

### Shared Types

```ts
/** Карточка товара для списка / ленты. Проекция ItemReadModel → view. */
type ItemListView = {
  itemId: ServiceId;
  typeId: TypeId;
  title: string;
  description: string | null;
  imageId: FileId | null;
  price: ItemPayment | null;
  rating: number | null;
  reviewCount: number;
  owner: { name: string; avatarId: FileId | null } | null;
  location: { cityId: string; address: string | null } | null;
  categoryIds: CategoryId[];
};

type SortOption = 'personal' | 'price-asc' | 'price-desc' | 'rating-desc' | 'newest';

type SearchFacets = {
  categories: { categoryId: CategoryId; name: string; count: number }[];
  types: { typeId: TypeId; name: string; count: number }[];
  priceRange: { min: number; max: number } | null;
  attributes: {
    attributeId: AttributeId;
    name: string;
    values: { value: string; count: number }[];
  }[];
};

type DynamicSearchFilters = {
  categoryIds?: CategoryId[];
  typeIds?: TypeId[];
  priceRange?: { min?: number; max?: number };
  attributeValues?: { attributeId: AttributeId; value: string }[];
};

/** Лёгкие метаданные кандидата для пост-ранкинга (без полного ItemReadModel) */
type PostRankingCandidate = {
  itemId: ServiceId;
  ownerId: OwnerId;
  nextEventDate: Date | null;    // urgency boost
  hasSchedule: boolean;          // schedule — urgency не применяется
};

/** Карточка лайкнутого товара. Расширяет ItemListView временем лайка. */
type LikedItemView = ItemListView & {
  likedAt: Date;
};

/** Событие взаимодействия пользователя с товаром */
type InteractionType = 'view' | 'click' | 'like' | 'purchase' | 'booking';

type UserInteractionEvent = {
  userId: UserId;
  itemId: ServiceId;
  interactionType: InteractionType;
  timestamp: Date;
};
```

## ADAPTERS

### PostgreSQL
Основное хранилище read model. Товары, категории, типы, владельцы, отзывы — денормализованные данные для быстрого чтения и фильтрации в каталоге и рекомендациях. Без foreign key constraints — неконсистентности обрабатываются на чтении. Hard delete при удалении сущностей.

Дополнительные таблицы:
- `user_likes` — лайки пользователей (`userId`, `itemId`, `likedAt`). Используется для GetLikedItems.
- `dead_letter_events` — DLQ для событий с ошибками проекции.
- `processed_events` — таблица для идемпотентности (`eventId`, `processedAt`, TTL).

### Meilisearch
Полнотекстовый поиск и динамические фильтры. Синхронизация — синхронно при проекции Kafka-событий (через `MeilisearchSyncPort`). При `owner.updated` — batch-обновление всех товаров владельца.

### Gorse
https://github.com/gorse-io/gorse
Рекомендательный движок. Синхронизация items — синхронно при проекции (через `GorseSyncPort`). User feedback (view, click, like, purchase, booking) отправляется при обработке `interaction.recorded` событий. Item labels в Gorse: `cityId`, `ageGroup`, `categoryIds[]`, `typeId`.

### Redis
Кэш ранжированных списков для cursor-пагинации по категориям (`RankedListCachePort`). TTL ~5 мин.
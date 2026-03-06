# Application

Модуль — **read-only**. Все данные поступают через Kafka. Единственная запись — сохранение `like` в PG при обработке `interaction.recorded` события.

## Ports

Все порты определены в [application/ports.ts](../application/ports.ts).

**Query Ports (read-only):**
- `ItemCandidatesPort` — top-N кандидатов для категории с метаданными для пост-ранкинга
- `NewSellerItemsPort` — товары новых продавцов для injection в ленту
- `ItemQueryPort` — findByIds, findCategoryItemsSorted, findPopular
- `LikedItemsQueryPort` — лайкнутые товары пользователя
- `CategoryListQueryPort` — список категорий по parentId
- `CategoryFiltersQueryPort` — фильтры категории

**Service Ports:**
- `RecommendationService` — Gorse recommend + rank
- `RankedListCachePort` — Redis кэш ранжированных списков
- `SearchPort` — Meilisearch полнотекстовый поиск + фасеты

## Queries

### [GetFeed](../application/use-cases/get-feed/get-feed.interactor.ts)

Персонализированная лента рекомендаций по всему каталогу.

**Input:** `{ userId?, cityId, ageGroup, cursor?, limit }`

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
4. `PostRankingService.apply(candidates)` → переупорядоченные items
5. Взять первые `limit` → трансформация в `ItemListView[]`

> Без фильтров в UI. Пре-фильтры (город, возрастная зона) задаются как item labels в Gorse.

---

### [GetCategoryItems](../application/use-cases/get-category-items/get-category-items.interactor.ts)

Товары в категории с фильтрами и сортировкой.

**Input:** `{ userId?, categoryId, cityId, ageGroup, filters: CategoryItemFilters, sort: SortOption, cursor?, limit }`

Типы [CategoryItemFilters, SortOption](../application/use-cases/get-category-items/types.ts) определены рядом с interactor.

**Output:** `{ items: ItemListView[], nextCursor: string | null }`

**Flow (sort = `personal`):**
1. Проверить `RankedListCachePort.get(cacheKey)` — если есть кэш, перейти к шагу 6.
2. `ItemCandidatesPort.findCategoryCandidates({ categoryId, cityId, ageGroup, filters, cap })` → `PostRankingCandidate[]`
   Возвращает top-N кандидатов (capping) с метаданными для пост-ранкинга, отсортированных по базовому скору (свежесть × популярность).
   Pre-ranking фильтры применяются на уровне SQL: просроченные товары исключены (`next_event_date > now() OR has_schedule = true`).
   New seller injection: товары новых продавцов (< 30 дней) получают boost factor в базовом скоре, гарантируя попадание в кандидаты.
3. `RecommendationService.rank({ userId, itemIds })` → `ServiceId[]`
   **Fallback:** если Gorse недоступен — пропускаем, кандидаты идут на пост-ранкинг в порядке базового скора.
4. `PostRankingService.apply(rankedCandidates)` → переупорядоченные IDs
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

### [GetCategoryFilters](../application/use-cases/get-category-filters/get-category-filters.interactor.ts)

Доступные фильтры для страницы категории. Набор определяется категорией: атрибуты (собственные + унаследованные) + допустимые типы + общие фильтры.

**Input:** `{ categoryId }`

**Output:** `CategoryFiltersReadModel`

**Flow:**
1. `CategoryFiltersQueryPort.findByCategoryId(categoryId)` → filters

---

### [GetCategoryList](../application/use-cases/get-category-list/get-category-list.interactor.ts)

Каталог категорий — список дочерних категорий с количеством товаров.

**Input:** `{ parentCategoryId: CategoryId | null }` (null = корневые)

**Output:** `CategoryListReadModel[]`

**Flow:**
1. `CategoryListQueryPort.findByParentId(parentCategoryId)` → categories

---

### [SearchItems](../application/use-cases/search-items/search-items.interactor.ts)

Полнотекстовый поиск через Meilisearch с динамическими фасетными фильтрами.

**Input:** `{ query, cityId, ageGroup, filters?: DynamicSearchFilters, cursor?, limit }`

Тип [DynamicSearchFilters](../application/use-cases/search-items/types.ts) — фильтры, показываемые только при наличии значений в текущей выборке. Структура определяется Meilisearch фасетами и может включать: категорию, атрибуты, цену, рейтинг, тип.

**Output:** `{ items: ItemListView[], facets: SearchFacets, nextCursor: string | null, total: number }`

**Flow:**
1. `SearchPort.search({ query, cityId, ageGroup, filters, cursor, limit })` → results + facets
   Meilisearch хранит денормализованные данные товаров, возвращает list view напрямую + фасеты.

---

### [GetLikedItems](../application/use-cases/get-liked-items/get-liked-items.interactor.ts)

Список лайкнутых товаров пользователя с поиском по названию.

**Input:** `{ userId, search?, cursor?, limit }`

**Output:** `{ items: LikedItemView[], nextCursor: string | null }`

**Flow:**
1. `LikedItemsQueryPort.findLikedItems({ userId, search, cursor, limit })` → liked items
   Сортировка по `likedAt DESC` (новые лайки первыми). Cursor — по `likedAt`.
   Если `search` указан — фильтрация по `title ILIKE '%search%'`.
   Просроченные товары **не исключаются** (пользователь должен видеть всё, что лайкнул).

---

## Pre-Ranking

Pre-ranking — фильтрация и injection кандидатов **до** отправки в Gorse. Цель: не тратить слоты рекомендательного движка на заведомо нерелевантные товары и гарантировать попадание важных товаров в выборку.

### 1. Expired event removal (фильтр)

Товары с виджетом `event-date-time`, у которых все даты в прошлом — исключаются на уровне БД-запросов. Не применяется к товарам с виджетом `schedule` (регулярное расписание не просрочивается).

Реализация:
- **PostgreSQL**: условие `next_event_date > now() OR has_schedule = true` в `ItemQueryPort.findByIds`, `ItemCandidatesPort.findCategoryCandidates`, `ItemQueryPort.findCategoryItemsSorted`.
- **Gorse**: периодическое удаление просроченных items из индекса Gorse (cron или по событию обновления товара). Это снижает шум в рекомендациях и освобождает слоты.
- **Meilisearch**: аналогичная фильтрация при индексации.

### 2. New seller injection (холодный старт продавца)

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

## Post-Ranking

Пост-ранкинг применяется **только при sort = `personal`** (лента + категория). При явной сортировке (цена, рейтинг) пользователь ожидает точный порядок — пост-ранкинг не применяется.

Реализация — [PostRankingService](../domain/services/post-ranking.service.ts). Чистая доменная логика (без портов, без IO). Принимает ранжированный список, применяет правила последовательно, возвращает переупорядоченный список.

### Правила

**1. Urgency boost (скоро закончится)**
- Условие: товар с `event-date-time` в ближайшем будущем
- Тиры: < 24ч → сильный буст, < 48ч → средний, < 7 дней → слабый
- Не применяется к `schedule`

**2. Owner diversity (разнообразие владельцев)**
- Не более 2 товаров одного владельца в окне из 5 последовательных позиций
- При нарушении — сдвигает дубль вниз до ближайшей допустимой позиции

### Порядок применения

```
1. Urgency boost          — поднять срочные
2. Owner diversity        — разбавить владельцев
```

Порядок важен: diversity применяется последним, чтобы не дать бустам скопить товары одного владельца.

### Метаданные для пост-ранкинга

Для ленты (GetFeed) метаданные берутся из `ItemReadModel` (уже загружен на шаге 3) и маппятся через [toRankingCandidate](../domain/mappers/post-ranking-candidate.mapper.ts).

Для категории (GetCategoryItems) загрузка полных `ItemReadModel` для 500 кандидатов — дорого. Поэтому `ItemCandidatesPort.findCategoryCandidates` возвращает лёгкие [PostRankingCandidate](../domain/read-models/post-ranking-candidate.read-model.ts).

# Рекомендательная система Discovery

## Архитектура

### Обзор

Рекомендательная система построена на трёх бэкендах:

| Компонент | Назначение |
|-----------|-----------|
| **Gorse** | Персонализированные и популярные рекомендации (collaborative + content-based filtering) |
| **Meilisearch** | Полнотекстовый поиск с фасетной фильтрацией |
| **PostgreSQL** | Денормализованные проекции для фильтрации, сортировки и fallback |

Данные синхронизируются через **Kafka-события** с идемпотентной обработкой (таблица `processed_events`).

### Потоки данных

```
Kafka Events (item.published, interaction.recorded, user.created, ...)
    |
    v
Projection Handlers (идемпотентные)
    |
    +---> PostgreSQL (discovery_items + junction tables)
    +---> Gorse (items + feedback + users)
    +---> Meilisearch (search index)
    |
    v
Interactors (GetFeed, GetCategoryItems, SearchItems)
    |
    +---> Gorse API (recommend / popular)
    +---> Redis (кеш ranked lists, TTL 5 мин)
    +---> PG Queries (фильтрация, fallback)
    |
    v
HTTP Controllers --> Client
```

---

## Gorse: модель данных

### Items

При публикации (`item.published`) item синхронизируется в Gorse:

```typescript
GorseItemPayload {
  ItemId: string
  IsHidden: false
  Labels: string[]       // content-based сигналы
  Categories: string[]   // каталожные + гео (H3)
  Timestamp: ISO string
  Comment: title
}
```

**Labels** (контентные сигналы для content-based filtering):

| Label | Пример | Назначение |
|-------|--------|-----------|
| `city:{id}` | `city:msk` | Город |
| `h3:4:{cell}`, `h3:5:`, `h3:6:` | — | Мульти-резолюция гео |
| `age:{group}` | `age:adults` | Возрастная группа |
| `type:{id}` | `type:service` | Тип item'а |
| `attr:{id}:{value}` | `attr:cuisine:italian` | Атрибуты категории |
| `payment:{strategy}` | `payment:free` | Тип оплаты |
| `price:{tier}` | `price:low` | free / low (<1000) / medium (<5000) / high |
| `schedule:true` | — | Есть расписание |
| `event:true` | — | Есть даты событий |
| `rating:{tier}` | `rating:high` | high (>=4) / medium (>=3) / low (>=2) |

**Categories** (используются Gorse для фильтрации при запросе рекомендаций):

- Каталожные categoryId + все ancestor'ы
- H3-ячейки (resolution 4, ~30 км): центральная + 6 соседних
- Кросс-продукт: `{h3cell}:{categoryId}` — для гео+категория фильтрации

### Users

При создании/обновлении пользователя:

```typescript
GorseUserPayload {
  UserId: string
  Labels: ["role:{role}"]   // role:user, role:admin
  Comment: fullName
}
```

### Feedback (взаимодействия)

| Тип | Вес | Класс |
|-----|-----|-------|
| `view` | 1 | read |
| `click` | 2 | read |
| `like` | 4 | positive |
| `purchase` | 8 | positive |
| `booking` | 8 | positive |

- `unlike` удаляет feedback типа `like` из Gorse
- Positive feedback участвует в collaborative filtering
- Read feedback учитывается в ранжировании

---

## Сценарии рекомендаций

### 1. Персонализированная лента (`GET /feed`)

```
Параметры: cityId, ageGroup, lat/lng, cursor, limit
```

1. Вычислить geoCategory из координат (H3 resolution 4) или fallback на cityId
2. `Gorse.getRecommend(userId, { category: geoCategory, n: limit, offset })`
3. Если Gorse недоступен — пустой список (graceful degradation)
4. Загрузить items из PG по полученным ID
5. Вернуть с offset-based курсором

### 2. Категория с персональной сортировкой (`GET /categories/:id/items?sort=personal`)

```
Параметры: categoryId, filters (type, price, rating, geo, dates, attributes...), cursor, limit
```

1. Сформировать cache key = `ranked:sha256({userId, categoryId, filters})[0:16]`
2. Проверить Redis-кеш (TTL 5 мин)
3. При промахе — запросить Gorse: `getRecommend(userId, { category: h3cell:categoryId, n: 500 })`
4. Загрузить из PG с SQL-фильтрами, пересортировать по Gorse-порядку
5. Закешировать в Redis (до 500 ID)
6. Пагинация по закешированному списку; если offset выходит за кеш — fallback на SQL `newest`

### 3. Категория с обычной сортировкой (price-asc, rating-desc, newest)

Прямой SQL-запрос с cursor-based пагинацией, без Gorse.

### 4. Полнотекстовый поиск (`GET /search`)

Meilisearch с фасетными фильтрами, fuzzy matching.

### 5. Популярное (fallback)

`Gorse.getPopular({ category })` — для анонимов или при недоступности персонализации.

---

## Инфраструктура

### H3 Geolocation

- **Resolution 4** (~30 км) — основные ячейки для item categories и user запросов
- **Resolution 5, 6** — дополнительные labels для content-based рекомендаций
- Item хранится в 7 ячейках (центр + 6 соседей) для покрытия граничных зон
- User запрос идёт по одной ячейке

### Redis Cache

- Ключ: `ranked:{hash}` — персонализированный ранжированный список для пары (user, category, filters)
- TTL: 5 минут
- Лимит: 500 item ID
- Инвалидация: только по TTL (нет активной инвалидации)

### Graceful Degradation

| Ситуация | Поведение |
|----------|----------|
| Gorse недоступен (feed) | Пустой список |
| Gorse недоступен (category, sort=personal) | Fallback на SQL `newest` |
| Gorse вернул пустой список | Fallback на SQL `newest` |
| Redis недоступен | Каждый запрос идёт в Gorse |
| Offset за пределами кеша | Дополнение из SQL `newest` |

---

## План улучшений

### P0 — Критичные (влияют на качество рекомендаций)

#### 1. Снижение кардинальности Gorse-категорий и фильтрация по ageGroup

**Проблема (кардинальность):** Gorse поддерживает отдельный recommendation list per category. Текущий кросс-продукт H3-ячеек с каталожными категориями создаёт взрывной рост общего числа уникальных категорий в системе:

```
C = каталожных категорий      ~50
A = ancestor категорий         ~20
G = H3-ячеек (resolution 4)   ~500 (зависит от географии)

Уникальные категории в Gorse:
  каталог:              C + A  =       70
  гео:                  G      =      500
  кросс-продукт:       G × (C + A) = 35 000
  ──────────────────────────────────────────
  Итого:                              ~35 500
```

35k категорий — тяжело для обучения модели, потребления памяти и скорости Gorse.

**Проблема (ageGroup):** `ageGroup` не передаётся в Gorse при запросе рекомендаций (см. `recommendation.adapter.ts`). Gorse ранжирует вперемешку детские и взрослые items, а SQL потом отбрасывает "чужие". Часть из RECOMMEND_CAP=500 тратится на items неправильной зоны.

**Решение — три изменения:**

1. **`{ageGroup}:` prefix на все Gorse-категории.** ageGroup — жёсткий partition приложения. Каждый item принадлежит ровно одному ageGroup, поэтому общее число категорий не удваивается (items `kids` не попадают в `adults:...`). Gorse будет сразу отдавать только items нужной зоны.

2. **Заменить full cross-product (все leaf + ancestor категории) на кросс-продукт только с root-категориями (~10 шт).** Leaf-категории фильтровать в SQL на пост-ранкинге.

3. **Снизить H3 resolution с 4 (~24 км) до 3 (~63 км).** Для досугового сервиса это оптимально: item + gridDisk(1) покрывает ~180 км — зона выходного досуга (Москва → Тула, Москва → Владимир). Больше items в ячейке = больше данных для collaborative filtering. Гео-точность ранкинга сохраняется через labels (`h3:4:`, `h3:5:`, `h3:6:`).

**Новая схема categories per item:**
```
С координатами:
  {ageGroup}:{h3cell_res3}                 × 7 ячеек  — для feed
  {ageGroup}:{rootCategory}:{h3cell_res3}  × 7 ячеек  — для category browsing

Без координат (удалённые мероприятия):
  {ageGroup}:global                                    — для feed
  {ageGroup}:{rootCategory}:global                     — для category browsing
```

**Резолв координат при sync:**
- Есть `coordinates` → H3 cell напрямую
- Нет `coordinates`, есть `cityId` → резолвить координаты города через `CityCoordinatesPort` → H3 cell
- Нет ни того, ни другого → `global` (удалённые мероприятия без привязки к месту)

**Новая кардинальность:**
```
R  = root-категорий (parentCategoryId = null)  = ~10
G  = H3-ячеек (resolution 3)                   = ~100

Для feed:              {ageGroup}:{h3cell}              = 2 × (100 + 1)     =    202
Для category browsing: {ageGroup}:{rootCat}:{h3cell}    = 2 × 10 × (100 + 1) =  2 020
─────────────────────────────────────────────────────────────────────────────────────────
Итого:                                                                        ~2 200
```

Снижение с ~35k до ~2.2k (16x).

**Изменения по сценариям:**

| Сценарий | Gorse category (запрос) | Пост-фильтрация |
|----------|------------------------|-----------------|
| Feed | `{ageGroup}:{h3cell}` | нет |
| Category browsing (personal) | `{ageGroup}:{rootCategory}:{h3cell}` | SQL по leaf categoryId |

**Root-категория для запроса:** берём через `ancestorIds[0]` из `discovery_categories`. Если запрошена сама root-категория — используем её напрямую.

**RECOMMEND_CAP:** можно оставить 500 — Gorse уже отсекает чужие root-категории, SQL дофильтровывает только root → leaf.

**Затрагиваемые файлы:**
- `infra/lib/geo/h3-geo.ts` — resolution 4 → 3, `itemGeoCategories()` принимает ageGroup и rootCategoryIds, убрать full cross-product с каталогом, добавить `global` fallback
- `adapters/gorse/gorse-sync.adapter.ts` — определять rootCategoryId через ancestorIds, резолвить cityId → координаты через `CityCoordinatesPort`, передавать ageGroup в categories
- `adapters/gorse/recommendation.adapter.ts` — формировать `{ageGroup}:{h3cell}` (feed) или `{ageGroup}:{rootCat}:{h3cell}` (category)
- `application/ports.ts` — `CategoryAncestorLookupPort`: добавить `findRootCategoryId(categoryId)`
- `application/use-cases/browse-feed/get-feed.interactor.ts` — передавать ageGroup в geoCategory
- `application/use-cases/browse-category/get-category-items.interactor.ts` — резолвить rootCategoryId, убрать `userGeoCategoryWithCatalog`

#### 1.1. Тестирование п.1

Подробный тест-план с покрытием всех списочных сценариев (feed, category browsing SQL/personal, search, likes), Gorse sync и edge cases: [REC_TEST_PLAN.md](./REC_TEST_PLAN.md)

Must-кейсы (блокеры релиза):
- ageGroup partition: Gorse не смешивает kids/adults (SYNC-7, F-AGE-1/2, C-P-AGE-1)
- Формат categories: feed `{ageGroup}:{h3cell_res3}`, browse `{ageGroup}:{rootCat}:{h3cell_res3}` (SYNC-1/2/3)
- Резолв cityId → координаты → H3 cell, не raw cityId (SYNC-4)
- Global fallback для items без геопозиции (SYNC-5)
- H3 resolution = 3 (SYNC-8)
- Root-категория резолвится через ancestorIds[0] (C-P-CAT-2/3)
- SQL post-filter по leaf categoryId в personal sort (C-P-CAT-1/4)
- Cache key включает ageGroup (C-P-CACHE-1)

#### 2. Холодный старт для новых пользователей

**Проблема:** Новый пользователь без interactions получает пустую ленту или только popular items. Gorse не может построить персональный профиль.

**Решение:**
- При регистрации собирать интересы (onboarding: выбор категорий/тегов)
- Передавать в Gorse как user labels: `interest:{categoryId}`
- Content-based рекомендации начнут работать сразу, до накопления collaborative сигналов

#### 2. Холодный старт для новых items

**Проблема:** Новый item без interactions не попадает в collaborative рекомендации. Зависит только от content-based matching по labels.

**Решение:**
- Boost для новых items: добавить label `fresh:true` + настроить Gorse `item_neighbor_type = "auto"` для активного content-based matching свежих items
- Explore/exploit баланс: настроить `explore_recommend` в Gorse конфиге (например, 0.2 = 20% exploration)

#### 3. Обогащение user labels

**Проблема:** Сейчас user хранится в Gorse только с `role:{role}`. Нет демографических/географических сигналов.

**Решение:**
- Добавить labels: `city:{cityId}`, `age:{ageGroup}`, `h3:4:{cell}` (home location)
- Улучшит content-based matching: похожие пользователи по локации и возрасту получат релевантные рекомендации до накопления поведенческих данных

### P1 — Важные (улучшение UX)

#### 4. Diversity в рекомендациях

**Проблема:** Gorse может выдавать однообразные рекомендации (все items одного типа/организации).

**Решение:**
- Post-processing: дедупликация по organizationId (не более 2-3 items одной org подряд)
- Перемешивание по typeId для разнообразия в ленте
- Можно реализовать как domain service `DiversityReranker` между Gorse-ответом и отдачей клиенту

#### 5. Активная инвалидация кеша

**Проблема:** TTL 5 минут означает, что пользователь видит устаревший ранкинг после лайка/покупки.

**Решение:**
- При `like`/`unlike`/`purchase`/`booking` — инвалидировать кеш пользователя (удалить все ключи `ranked:*` для userId)
- Или: хранить в Redis маппинг `user:{userId}:ranked_keys` → set of cache keys, удалять при значимом действии

#### 6. Трекинг impression'ов

**Проблема:** Gorse не знает, какие items пользователь видел но не кликнул (negative signal).

**Решение:**
- Клиент отправляет `impression` event при отображении карточки в viewport
- Передавать в Gorse как read feedback типа `impression` (вес 0 или отдельный тип)
- Gorse учтёт "видел но не заинтересовался" при ранжировании

### P2 — Оптимизации

#### 7. A/B тестирование рекомендаций

**Проблема:** Нет механизма сравнения алгоритмов и параметров.

**Решение:**
- Ввести `experiment_group` для пользователей (label в Gorse)
- Разные Gorse конфиги/модели для разных групп
- Метрики: CTR, conversion rate, session depth по группам

#### 8. Fallback-стратегия для ленты

**Проблема:** При недоступности Gorse лента пуста — плохой UX.

**Решение:**
- Вместо пустого списка — fallback на SQL: `newest` items в гео-категории пользователя
- Можно предзаполнять Redis-кеш popular items как emergency fallback

#### 9. Prefetch и прогрев кеша

**Проблема:** Первый запрос пользователя в категорию с `sort=personal` всегда медленный (Gorse + PG + Redis write).

**Решение:**
- Background job: при значимых событиях (like, purchase) — асинхронно прогревать кеш для top-категорий пользователя
- Cron: периодически обновлять кеш для активных пользователей

#### 10. Мониторинг качества рекомендаций

**Проблема:** Нет метрик качества — непонятно, насколько хорошо работают рекомендации.

**Решение:**
- Логировать: recommendation source (gorse/popular/sql-fallback), position clicked, time-to-click
- Метрики: Precision@K, Recall@K, nDCG по logged interactions
- Dashboard: доля персонализированных vs fallback ответов


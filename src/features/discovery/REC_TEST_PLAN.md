# Тест-план: снижение кардинальности Gorse-категорий + ageGroup (п.1)

Подробный тест-план для изменений из [REC_SPEC.md](./REC_SPEC.md), п.1.

## Gorse Sync (write path)

| ID | Тест-кейс | Приоритет |
|----|-----------|-----------|
| SYNC-1 | `upsertItem` с координатами записывает feed-categories = `{ageGroup}:{h3cell_res3}` x 7 ячеек | must |
| SYNC-2 | `upsertItem` с координатами записывает browse-categories = `{ageGroup}:{rootCat}:{h3cell_res3}` x 7 ячеек | must |
| SYNC-3 | `upsertItem` НЕ записывает leaf/ancestor каталожные categoryId в Gorse categories | must |
| SYNC-4 | `upsertItem` без coordinates, с cityId — резолвит координаты города через `CityCoordinatesPort` → H3 cell (не raw cityId) | must |
| SYNC-5 | `upsertItem` без coordinates, без cityId (удалённое мероприятие) — categories = `{ageGroup}:global` + `{ageGroup}:{rootCat}:global` | must |
| SYNC-6 | Labels по-прежнему содержат каталожные атрибуты (`type:`, `attr:`, `age:`) | must |
| SYNC-7 | Item с `ageGroup=kids` не попадает в категорию `adults:*` | must |
| SYNC-8 | H3 resolution = 3 (не 4) в записанных categories | must |

## Feed (`GET /feed`)

| ID | Тест-кейс | Приоритет |
|----|-----------|-----------|
| F-AGE-1 | Items `ageGroup=kids` НЕ появляются в feed с `ageGroup=adults` | must |
| F-AGE-2 | Items `ageGroup=adults` НЕ появляются в feed с `ageGroup=kids` | must |
| F-GEO-1 | Items в Москве не появляются в feed с координатами Питера (разные H3 ячейки res 3) | should |
| F-GEO-2 | Items в соседних H3 ячейках res 3 (~63 км) появляются в feed (gridDisk radius 1) | should |
| F-GLOBAL-1 | Items с `{ageGroup}:global` появляются в feed при любых координатах | should |
| F1 | coordinates → `{ageGroup}:{h3cell_res3}` резолвится корректно | must |
| F2 | cityId → CityCoordinatesPort → координаты → `{ageGroup}:{h3cell_res3}` | must |
| F3 | cityId not found → fallback (пустой список или error) | should |
| F4 | userId есть → `getRecommend` (personalized) | must |
| F5 | userId нет → `getPopular` (anonymous) | must |
| F6 | Gorse throws → catch → пустой список | should |
| F7 | Gorse вернул пустой список → пустой ответ | should |
| F8 | Gorse IDs, часть не найдена в PG → фильтрация без ошибок | should |
| F9 | Пагинация: первая страница (offset=0) | must |
| F10 | Пагинация: вторая+ страница с cursor | should |

## Category browsing — SQL sort (`sort != personal`)

План 1 не меняет эту ветку. Регрессионные тесты:

| ID | Тест-кейс | Приоритет |
|----|-----------|-----------|
| C-SQL-1 | `sort=newest` — порядок по publishedAt DESC | should |
| C-SQL-2 | `sort=price-asc` / `price-desc` — порядок по цене | should |
| C-SQL-3 | `sort=rating-desc` — порядок по рейтингу | should |
| C-SQL-4 | Фильтры (typeIds, priceRange, minRating, attributeFilters, geoRadius) | should |
| C-SQL-5 | `ageGroup` фильтруется в SQL | should |
| C-SQL-6 | Cursor-based пагинация стабильна | should |

## Category browsing — personal sort (`sort=personal`)

Основные изменения плана 1:

```
fetchAndRankGorseIds
├── resolveRootCategory(categoryId) → rootCategoryId (через ancestorIds[0])
├── resolveGeoCategory → {ageGroup}:{rootCat}:{h3cell_res3}        [НОВОЕ]
├── Gorse recommend(n=500, category={ageGroup}:{rootCat}:{h3cell})
│   ├── возвращает items из root-категории в гео-зоне
│   └── SQL post-filter по leaf categoryId + filters               [НОВОЕ]
└── reorder по Gorse-рангу → cache → paginate
```

| ID | Тест-кейс | Приоритет |
|----|-----------|-----------|
| C-P-AGE-1 | Items чужого `ageGroup` не приходят от Gorse | must |
| C-P-CAT-1 | Gorse возвращает items из root-категории; SQL post-filter оставляет только leaf | must |
| C-P-CAT-2 | Запрос по leaf-категории резолвится в `{ageGroup}:{rootCat}:{h3cell}` через `ancestorIds[0]` | must |
| C-P-CAT-3 | Запрос по root-категории — используется напрямую, без резолва ancestor | must |
| C-P-CAT-4 | Порядок Gorse-ранкинга сохраняется после SQL post-filter (пропуск ID не ломает sort) | must |
| C-P-CAT-5 | Gorse вернул 500, SQL post-filter оставил мало (15) — пагинация + fallback на newest | should |
| C-P-CACHE-1 | Cache key включает ageGroup (разные зоны → разные кеши) | must |
| C-P-CACHE-2 | Cache hit → результат не содержит items чужой leaf-категории | should |
| C-P-FILL-1 | Offset на границе кеша: N items из Gorse + M из SQL newest, без дубликатов | should |
| C-P-FILL-2 | Offset за пределами кеша → SQL fallback, excludeIds = все Gorse ID | should |
| C-P-7 | Gorse вернул пустой список → SQL fallback newest | should |
| C-P-8 | Gorse throws → catch → SQL fallback | should |
| C-P-9 | Нет координат, cityId резолвится → H3 cell (не raw cityId) | should |
| C-P-GLOBAL-1 | Items без геопозиции (`global`) доступны при category browsing | should |

## Search (`GET /search`)

План 1 не затрагивает Meilisearch. Регрессионно:

| ID | Тест-кейс | Приоритет |
|----|-----------|-----------|
| S-1 | Поиск возвращает только items с matching ageGroup | should |
| S-2 | Full-text по title | should |

## Liked items (`GET /items/liked`)

План 1 не затрагивает. Регрессионно:

| ID | Тест-кейс | Приоритет |
|----|-----------|-----------|
| L-1 | Возвращает только лайки текущего пользователя | should |
| L-2 | Cursor пагинация по likedAt DESC | should |

# Plan: Сортировка категорий (order)

## Подход

Добавляем поле `order: integer` (default `0`) в категорию. Сортировка: `ORDER BY order ASC, name ASC` — категории с одинаковым order сортируются по имени.

### Почему `order` integer, а не другие подходы

| Подход | Плюсы | Минусы |
|--------|-------|--------|
| **`order` integer** ✅ | Просто, понятно, быстро | При вставке между — сдвиг соседей |
| Fractional indexing (lexorank) | Вставка без сдвигов | Overkill для ~20-50 категорий |
| Linked list (prev/next) | Вставка O(1) | Сложные запросы, нет ORDER BY |
| Array ID на родителе | Один источник порядка | Денормализация, сложнее в запросах |

Для небольшого количества категорий (~десятки) integer `order` — оптимальный выбор. Админ просто выставляет числа (0, 10, 20...) или drag-and-drop пересчитывает их.

---

## Затронутые слои

### 1. Domain — `CategoryEntity`

**Файл:** `src/features/cms/domain/aggregates/category/entity.ts`

- Добавить поле `order: number` в `CategoryEntity` state (default `0`)
- Принимать `order` в `CreateCategoryCommand` и `UpdateCategoryCommand`
- Пробросить в `CategoryEntity.create()` и `CategoryEntity.update()`

**Файл:** `src/features/cms/domain/aggregates/category/commands.ts`

- Добавить `order?: number` в `CreateCategoryCommand`
- Добавить `order?: number` в `UpdateCategoryCommand`

### 2. Domain Events

**Файл:** `src/features/cms/domain/aggregates/category/events.ts`

- Добавить `order` в payload `CategoryCreatedEvent` и `CategoryUpdatedEvent`

**Файл:** `src/kernel/domain/events/category.events.ts`

- Добавить `order` в payload `CategoryPublishedEvent` (для discovery projection)

### 3. DB Schema

**Файл:** `src/features/cms/adapters/db/schema.ts`

- Добавить колонку `order: integer('order').default(0).notNull()` в `cmsCategories`

**Файл:** `src/features/discovery/adapters/db/schema.ts`

- Добавить колонку `order: integer('order').default(0).notNull()` в `discoveryCategories`

**Миграция:** удалить папку `drizzle/`, перегенерировать (`yarn drizzle-kit generate`)

### 4. Application — Ports

**Файл:** `src/features/cms/application/ports.ts`

- Добавить `order` в тип `CategoryListItem`

### 5. Adapters — CMS

**Файл:** `src/features/cms/adapters/db/repositories/category.repository.ts`

- Маппить `order` при save/restore

**Файл:** `src/features/cms/adapters/db/queries/category.query.ts`

- `findAll()`: изменить orderBy на `.orderBy(asc(cmsCategories.order), asc(cmsCategories.name))`
- Маппить `order` в результат

**Файл:** `src/features/cms/adapters/http/categories.controller.ts`

- Пробросить `order` в request body (create/update) и response

### 6. Adapters — Discovery

**Файл:** `src/features/discovery/adapters/db/repositories/category-projection.repository.ts`

- Маппить `order` при upsert из `CategoryPublishedEvent`

**Файл:** `src/features/discovery/adapters/db/queries/category-list.query.ts`

- Добавить `.orderBy(asc(discoveryCategories.order), asc(discoveryCategories.name))`

**Файл:** `src/features/discovery/domain/read-models/category.read-model.ts`

- Добавить `order` в read model

**Файл:** `src/features/discovery/domain/read-models/category-list.read-model.ts`

- `order` не нужен в list read model (он только для сортировки в SQL, клиенту не отдаётся)

### 7. HTTP Contracts (OpenAPI)

**Файл:** `http-contracts/shared/cms.yaml`

- Добавить `order: integer` в `CmsCategoryListItem` и `CmsCategoryDetail`
- Добавить `order: integer` в request body create/update

**Файл:** `http-contracts/shared/discovery.yaml`

- `order` НЕ добавляем в public response — клиент получает уже отсортированный массив

После изменений: `yarn openapi`

### 8. Админка (admin)

- Отображать `order` в форме создания/редактирования категории (input number)
- Опционально: drag-and-drop в списке с автоматическим пересчётом order (можно во вторую итерацию)

---

## Порядок реализации

1. Domain: entity, commands, events
2. Kernel: integration event
3. DB schema + миграция
4. CMS adapters: repository, query, controller
5. Discovery adapters: projection, query, read model
6. HTTP contracts + `yarn openapi`
7. Админка: форма с полем order

---

## Пример SQL после изменений

```sql
-- CMS (админка) — все категории
SELECT * FROM cms_categories ORDER BY "order" ASC, name ASC;

-- Discovery (фронтенд) — корневые категории
SELECT * FROM discovery_categories
WHERE parent_category_id IS NULL
ORDER BY "order" ASC, name ASC;
```

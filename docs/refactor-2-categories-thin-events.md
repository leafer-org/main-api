# Refactor #2 — Migrate `categories` to thin events + `CategoryDirectoryPort`

## Цель

Вынести из discovery `CategoryProjectionPort` + `CategoryAncestorLookupPort`
в cms-фичу как **single source-of-truth read-port**
`CategoryDirectoryPort` (с включёнными ancestor-chain). Discovery становится
тоньше: использует kernel-port напрямую вместо собственной проекции.

## Объём

~6-8ч. **Средний риск.**

Болезненная часть — cascade-логика на items при `republish` категории —
**не лечится этим рефакторингом** (структурное свойство Meili-индекса).

## Когда делать

Не срочно. Триггеры:
- В третьем месте понадобится ancestor-chain (сейчас он в discovery local + computational)
- Cascade-логика при category-changed станет тяжёлой для поддержки
- Появится новый consumer category-данных
- Параллельно с Refactor #3 (organization), если понадобится включать
  ancestor-chain в `item_publication_view`

## Шаги

### 1. Kernel-порт

Файл: `src/kernel/application/ports/category-directory.ts`

```ts
export type CategoryDirectoryView = {
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: MediaId;
  order: number;
  status: 'draft' | 'published' | 'archived';
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];      // корень → self
  ageGroups: AgeGroup[];
  attributes: CategoryAttribute[];
};

export abstract class CategoryDirectoryPort {
  abstract findById(id: CategoryId): Promise<CategoryDirectoryView | null>;
  abstract findByIds(ids: readonly CategoryId[]): Promise<CategoryDirectoryView[]>;
  abstract findChildren(parentId: CategoryId | null): Promise<CategoryDirectoryView[]>;
}
```

`ancestorIds` — денормализованный chain до корня. Нужен в большинстве consumer'ов
(geo-категории, фасеты в Meili, gorse labels).

### 2. Read-side в cms

Файл: `src/features/cms/adapters/db/queries/category-directory.query.ts`

Под капотом два варианта:
- **(a)** `findById/findByIds` через рекурсивный CTE для ancestor-chain
  (Postgres `WITH RECURSIVE`) — простота, чуть дороже latency
- **(b)** Денормализованная колонка `ancestor_ids jsonb` в `cms_categories`,
  заполняется при save категории (через триггер или в repository)

**Рекомендую (b)** — категории меняются редко, чтения частые. Latency лучше.

### 3. Денормализация ancestor-chain (опционально)

ALTER TABLE `cms_categories` ADD COLUMN `ancestor_ids jsonb DEFAULT '[]'`.

Заполнение:
- В `CategoryRepository.save`: при изменении `parentCategoryId` пересчитать chain
  для самой категории + для всех потомков (рекурсивный update)
- Backfill для существующих данных — single-shot скрипт или idempotent
  `OnApplicationBootstrap`

### 4. Тонкое событие

Файл: `src/infra/kafka-contracts/category.contract.ts`

```ts
{
  categoryId: string,
  type: 'category.changed',
  changedAt: string  // ISO
}
```

Заменяет `CategoryPublishedEvent` + `CategoryUnpublishedEvent`. Один thin event;
discovery дальше через port'е смотрит `status` (`published`/`archived`/null).

### 5. Publisher в cms

В `CategoryRepository.save` — `outbox.enqueue` thin event на каждый save.
Удалить fat-publisher'ы старых событий.

### 6. Consumer'ы (только discovery)

`src/features/discovery/application/use-cases/project-category/project-category.handler.ts`:

```ts
async handleCategoryChanged(eventId, { categoryId }) {
  if (await idempotency.isProcessed(eventId)) return;
  const cat = await categoryDirectory.findById(categoryId);
  if (!cat || cat.status !== 'published') {
    await projection.delete(categoryId);
    // optionally cascade delete items in Meili/Gorse
  } else {
    await projection.upsert(cat);
    if (wasRepublishedHeuristic) {
      // Re-sync items этой категории — структурное свойство Meili-индекса,
      // см. секцию "не лечится этим рефакторингом"
      const items = await itemProjection.findReadModelsByCategoryIds([categoryId]);
      if (items.length > 0) {
        await Promise.all(items.map(i => gorse.upsertItem(i)));
        await meilisearch.upsertItems(items);
      }
    }
  }
  await idempotency.markProcessed(eventId);
}
```

`republished` flag убирается из event'а. Если cascade на items нужен всегда при
изменении — просто всегда re-sync. Если только при изменении ancestor-chain —
сравнить старый/новый view (delta detection).

### 7. Удаление дублирующих ports

- `discovery/application/projection-ports.ts: CategoryProjectionPort` — **удалить**
- `discovery/application/ports.ts: CategoryAncestorLookupPort` — **удалить**
- Все usage этих портов в discovery (search-items, get-item-detail, etc.) →
  переключить на `CategoryDirectoryPort` (kernel)

### 8. Удаление category projection table в discovery

Если discovery имеет `discovery_categories` таблицу-проекцию — её можно
**дропнуть**. Все читают через kernel-port из cms.

Caveat: каждый search-запрос будет дёргать cms-port. Категорий мало (десятки-сотни),
PG cache спасает. **Опционально:** добавить in-memory cache в адаптер
`CategoryDirectoryPort`-импла (TTL 60s) если perf станет вопросом.

### 9. Tests

- Unit: `CategoryDirectoryPort.findByIds` возвращает правильный ancestor-chain
- Unit: rename категории → следующий read возвращает новое name
- e2e: publish категории → discovery видит её в search (без своего CategoryProjectionPort)
- e2e: republish категории с новым родителем → items этой категории re-indexed
  с новыми ancestorIds в Meili/Gorse

## Что НЕ лечится этим рефакторингом

**Cascade на items при republish категории остаётся.** Это структурное
свойство Meili-индекса: items хранятся как flat-документы с
`rootCategoryIds[]`. При изменении родителя категории все items этой категории
должны быть переиндексированы. Thin events vs fat events этого не меняют.

Лечится только: денормализация ancestor-chain в `item_publication_view`
**внутри organization** (Refactor #3) + лазёрный запрос в Meili (а не batch
re-index). Тогда smarter indexer может сделать partial-update только для
affected items без полного re-upsert.

## Риски

- Если есть consumer'ы `CategoryPublishedEvent` помимо discovery — мигрировать
  всех одновременно (e.g. organization индексирует категории при создании item)
- Performance: каждый search-запрос дёргает cms-port для category data.
  PG cache спасает. Измерить нагрузку на baseline.
- Consistency: discovery теперь read-after-write зависит от cms.
  Один DB — нет проблемы. Если будет split — это новый coupling, обдумать.

## Критические допущения

- `cms_categories` не очень большая (десятки-сотни строк) — кэш в порту допустим
- ancestor-chain помещается в jsonb (depths < 10) — практически всегда
- discovery — единственный consumer category-стрима

## Альтернатива (если делать совсем по-минимуму)

Заменить только schema event'а на thin, оставить остальное как есть:
- thin event `category.changed { categoryId }`
- discovery handler по-прежнему свою projection держит, но при каждом event'е
  читает свежий state из cms через port

Получим schema-evolution-friendly, не получим упрощения discovery.
ROI ниже. Делать только если это попутно с другим рефакторингом.

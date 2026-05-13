# Refactor #3 — `organization`: thin events + read-models (CQRS-в-фиче)

## Цель

Самая ёмкая миграция, наибольший эффект. Переехать `organization` на
**CQRS-в-фиче**: jsonb-aggregate как write-side, плоские read-таблицы внутри
самой фичи как read-side. Параллельно тонкие события, kernel read-порты для
других фич.

**Главные победы:**
1. Убить cascade-логику в `discovery/ProjectOwnerHandler`
2. Убить double-denormalization (owner.name живёт и в `discovery_owners`,
   и в каждом `discovery_items`)
3. Подготовить read-views для chat preview и других consumer'ов
4. Уменьшить event-payload'ы (без `widgets[]` в каждом item-event'е)

## Объём

~15-25ч. **Высокий риск** (затрагивает несколько фич, миграции данных,
event-replay).

## Этапы

Разбит на два самостоятельных этапа: **A** (read-side в organization, минимально
инвазивный) и **B** (тонкие события + рефакторинг discovery, серьёзный).

---

## Этап A — read-side в organization

### Объём
~4-6ч. **Низкий риск.** Не ломает discovery.

### Когда делать
**Прямо сейчас** для chat preview и других задач с lookup-ом данных орг/items.

### A1. Schema: новые read-таблицы

```sql
CREATE TABLE organization_directory (
  organization_id   uuid PRIMARY KEY,
  name              text NOT NULL,
  avatar_media_id   text NULL,
  is_published      boolean NOT NULL,
  updated_at        timestamptz NOT NULL
);

CREATE TABLE item_directory (
  item_id           uuid PRIMARY KEY,
  organization_id   uuid NOT NULL,
  title             text NOT NULL,
  cover_media_id    text NULL,
  is_published      boolean NOT NULL,
  updated_at        timestamptz NOT NULL
);
CREATE INDEX item_directory_org_idx ON item_directory(organization_id);

CREATE TABLE item_publication_view (
  item_id              uuid PRIMARY KEY,
  organization_id      uuid NOT NULL,
  type_id              uuid NOT NULL,
  title                text NOT NULL,
  description          text NOT NULL,
  media_jsonb          jsonb NOT NULL,
  owner_name           text NOT NULL,        -- snapshot из organization
  owner_avatar_id      text NULL,
  owner_contacts_jsonb jsonb NOT NULL,
  owner_team_jsonb     jsonb NULL,
  age_group            text NULL,
  location_jsonb       jsonb NULL,
  payment_jsonb        jsonb NOT NULL,
  category_ids_jsonb   jsonb NOT NULL,
  attribute_values_jsonb jsonb NOT NULL,
  is_published         boolean NOT NULL,
  published_at         timestamptz NULL,
  updated_at           timestamptz NOT NULL
);
CREATE INDEX ipv_org_idx ON item_publication_view(organization_id);
CREATE INDEX ipv_published_idx ON item_publication_view(is_published) WHERE is_published = true;
```

### A2. UPSERT logic в repositories

`OrganizationRepository.save`:
- После основного save → UPSERT `organization_directory`
- При rename / avatar-change → BULK UPDATE `item_publication_view SET owner_name=..., owner_avatar_id=...`
  для всех items этой орг (одной SQL-операцией, не fan-out per-item)

`ItemRepository.save`:
- После основного save → UPSERT `item_directory`
- + UPSERT `item_publication_view` (с inline owner-snapshot из той же org-state в той же tx)

Транзакционно — в той же tx что и aggregate save. Никакой eventual consistency
внутри organization.

### A3. Kernel-порты

```ts
// kernel/application/ports/organization-directory.ts
export type OrganizationDirectoryView = {
  organizationId: OrganizationId;
  name: string;
  avatarMediaId: string | null;
  isPublished: boolean;
};
abstract class OrganizationDirectoryPort {
  abstract findById(id): Promise<OrganizationDirectoryView | null>;
  abstract findByIds(ids): Promise<OrganizationDirectoryView[]>;
}

// kernel/application/ports/item-directory.ts
export type ItemDirectoryView = {
  itemId: ItemId;
  organizationId: OrganizationId;
  title: string;
  coverMediaId: string | null;
  isPublished: boolean;
};
abstract class ItemDirectoryPort {
  abstract findById(id): Promise<ItemDirectoryView | null>;
  abstract findByIds(ids): Promise<ItemDirectoryView[]>;
}

// kernel/application/ports/item-publication-view.ts
export type ItemPublicationView = { /* полный shape */ };
abstract class ItemPublicationViewPort {
  abstract findById(id): Promise<ItemPublicationView | null>;
  abstract findByIds(ids): Promise<ItemPublicationView[]>;
  abstract findPublishedByOrganization(orgId): Promise<ItemPublicationView[]>;
}
```

### A4. Реализации в organization

Тривиальные query-адаптеры в `src/features/organization/adapters/db/queries/`.
Регистрация в `OrganizationModule` (он уже `@Global()`, добавить в exports).

### A5. Backfill миграция

Скрипт, наполняющий новые таблицы из существующих jsonb-aggregate'ов:
- Прочитать все `organizations.state` → INSERT в `organization_directory`
- Прочитать все `items.state` + JOIN org-state → INSERT в `item_publication_view`

Реализация:
- Либо `@OnApplicationBootstrap` с idempotent INSERT (для local-dev)
- Либо отдельный `yarn run backfill:organization-views` (для прода)

### A6. Использование в chat preview (закрывает текущую задачу)

В `DrizzleChatQuery.findClientChats / findOperatorChats`:
- Сначала собрать сырой page
- Batched-резолв через `OrganizationDirectoryPort` + `ItemDirectoryPort` +
  `UserDirectoryPort` (последний из Refactor #1, или существующий
  `UserLookupPort` пока)
- Enrich response

OpenAPI расширить:
- `ChatListItem.participants[].displayName?: string`
- `ChatListItem.participants[].avatarMediaId?: string`
- `ChatListItem.contextItem?: { itemId, title, coverMediaId }` (вместо raw `contextItemId`)

### Что закрывает Этап A
- ✅ Chat preview без N+1 на клиенте
- ✅ Подготовлен фундамент для Этапа B
- ✅ Не ломает discovery, не ломает существующие consumer'ы
- ❌ Cascade-логика в discovery остаётся
- ❌ Fat events остаются

---

## Этап B — тонкие события + рефакторинг discovery

### Объём
~10-15ч. **Высокий риск.**

### Когда делать
- Появится 2-й consumer publication-данных (analytics, BI, второй поисковик)
- Cascade в discovery станет хроническим тех долгом
- Будет окно на серьёзный рефакторинг с возможным re-index'ом

### B1. Новые тонкие события

`src/infra/kafka-contracts/organization.contract.ts`:
```ts
{ organizationId, type: 'organization.publication-changed', changedAt }
```

`src/infra/kafka-contracts/item.contract.ts`:
```ts
{ itemId, organizationId, type: 'item.publication-changed', changedAt }
```

`republished` flag — убирается. Discovery всё равно перепишет state из port'а.

**Subtle:** не объединять с `organization.respondability-changed` (он уже есть для
chat-проекции). Это разные события с разными подписчиками.

### B2. Publishers в organization

- `OrganizationRepository.save` → emit `organization.publication-changed`
  на любой save
- `ItemRepository.save` → emit `item.publication-changed` на любой save

### B3. Discovery — handler-ы становятся тонкими

`ProjectItemHandler.handleItemChanged`:
```ts
async handle(eventId, { itemId }) {
  if (await idempotency.isProcessed(eventId)) return;
  const view = await orgItemPublicationView.findById(itemId);
  if (!view || !view.isPublished) {
    await projection.delete(itemId);
    await gorse.deleteItem(itemId);
    await meilisearch.deleteItem(itemId);
    return;
  }
  // Discovery-специфичный enrichment: category-tree expansion, h3 geo
  const enriched = enrichWithCategoryTree(
    view,
    await categoryDirectory.findByIds(view.categoryIds),
  );
  await projection.upsert(enriched);
  await gorse.upsertItem(enriched);
  await meilisearch.upsertItem(enriched);
  await idempotency.markProcessed(eventId);
}
```

`ProjectOwnerHandler` — **удаляется полностью.**

Org-rename теперь обновляет `item_publication_view` в самой organization
(BULK UPDATE), и эмитит **один** `organization.publication-changed` event.
Discovery handler делает `findPublishedByOrganization(orgId)` → fan-out внутри
себя:

```ts
async handleOrganizationChanged(eventId, { organizationId }) {
  if (await idempotency.isProcessed(eventId)) return;
  const items = await orgItemPublicationView.findPublishedByOrganization(organizationId);
  for (const view of items) {
    const enriched = enrichWithCategoryTree(view, ...);
    await meilisearch.upsertItem(enriched);
    await gorse.upsertItem(enriched);
  }
  // Можно отдельно обновить owner-projection в discovery, если она ещё нужна
  await idempotency.markProcessed(eventId);
}
```

Альтернатива: эмитить **отдельный event на каждый item** при org-rename (как
сейчас). Меньше fan-out в handler'е, больше event'ов в Kafka. **Решение:**
делать org-event с fan-out в handler'е — events меньше, handler нагляднее.

### B4. Удаление double-denormalization

- `discovery_owners` projection — **остаётся**, нужна для own org-search в Meili
- `discovery_items.owner_*` — **остаётся** в discovery's projection, но больше
  не cascade'ится — берётся из `item_publication_view` snapshot
- Альтернатива: вообще удалить `discovery_owners` projection, делать org-search
  через kernel `OrganizationDirectoryPort`. Зависит от того, чем разнится
  `discovery_owners` от `organization_directory` — если только по
  Meili/gorse-индексации, то оставить.

### B5. Удаление fat-полей из старых событий

После переключения всех consumer'ов:
- `OrganizationPublishedEvent.name/avatar/contacts/team/republished` → **удалить**
- `ItemPublishedEvent.widgets` → **удалить**
- Сами `OrganizationPublishedEvent` / `ItemPublishedEvent` → опционально
  удалить или оставить как сигнал-событие

### B6. Удалить лишние discovery-проекции

- `CategoryAncestorLookupPort` — заменён на `CategoryDirectoryPort` (Refactor #2)
- `ProjectOwnerHandler` — **удалить весь handler** (cascade больше не нужен)
- Owner-cascade-логика — **удалить из codebase**

### B7. Migration data + replay

Items, опубликованные **до** деплоя этой схемы, нужно re-emitить:
- При deploy запустить «replay»: итерация по
  `item_publication_view WHERE is_published = true`
- Эмитить `item.publication-changed` для каждого → discovery переиндексирует
- Опция в env: `REPLAY_ON_BOOT=true` для one-shot replay'а

### B8. Tests

- e2e: создание + публикация орг → directory + publication_view заполнены,
  discovery индексирует item с правильным `owner_name`
- e2e: rename орг → BULK UPDATE `item_publication_view` → discovery получает
  один event → fan-out в handler'е → Meili обновлён с новым `owner_name`
- e2e: unpublish орг → каскадное удаление items в discovery
- e2e: replay → boot triggers replay → discovery восстанавливает индексы
- Нагрузочный (опционально): rename орг с 1000 items —
  bulk update + 1 event vs old per-item cascade (~1000 events)

## Риски

- **Большая поверхность изменений.** Ломает discovery, organization, items.
  Нужно атомарно — один deploy.
- **Backfill ошибки.** Если `item_publication_view` неправильно посчитан для
  существующих items — несогласованность с aggregate. Лечится re-emit
  event'ов после починки backfill-скрипта.
- **Event flood при org-rename.** При 1000 items → 1000 thin events,
  если идти per-item путём. Решение: один org-event с fan-out в handler'е (B3).
- **Потеря `republished` flag'а.** Старая логика "is republish?" заменяется на
  "сравни с предыдущим snapshot'ом если надо" — delta-detection в handler'е.
  Большинству consumer'ов это не нужно (просто overwrite), но проверить
  business-logic потребителей.
- **Replay coordination.** Если есть несколько deployment'ов discovery —
  нужно координировать чтобы replay не запускался дважды.

## Критические допущения

- Postgres BULK UPDATE на `item_publication_view` для всех items орга —
  приемлемая операция (даже на 10K items это ~100ms)
- Все consumer'ы fat-события `organization.published` известны и можно
  мигрировать одновременно
- discovery's gorse/Meili индексы можно re-build при запуске после миграции
  (downtime allowed на момент миграции)

## Рекомендуемая последовательность

1. **Сначала Этап A** — он самостоятельный, минимально-инвазивный, закрывает
   chat preview задачу. Можно делать прямо сейчас.
2. **Параллельно или после Этапа A — Refactor #2** (categories), если будет
   нужен ancestor-chain в `item_publication_view` для удобства downstream
   потребителей.
3. **Этап B — отдельным крупным milestone'ом**, когда триггеры сработают.
4. Refactor #1 (users) — делать только когда триггер сработает.

## Что НЕ входит в этот рефакторинг

- Реактивный disconnect / live-update в Centrifugo (отдельная задача)
- Перенос discovery в Meilisearch для всех read-моделей (см. discussion в
  team docs — Postgres достаточен для transactional read-models, Meili
  для search/relevance)
- Отказ от outbox в пользу Debezium / Postgres logical replication (вопрос
  инфры, не архитектуры фичи)

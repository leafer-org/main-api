# Domain Events & Projection Handlers для Discovery

**Модификации применены:**
1. ~~ServiceId~~ → `ItemId` везде в item-контексте
2. Category events: ~~Created/Updated/Deleted~~ → `Published`/`Unpublished` (с флагом `republished`)
3. Item events: ~~Published/Updated/Unpublished~~ → `Published`/`Unpublished` (с флагом `republished`)

## Context

Discovery — read model модуль, все данные поступают через Kafka. Нужно спроектировать:
1. **Domain events** в kernel — типы событий, которые приходят по Kafka
2. **Projection handlers** в application — обработчики, которые проецируют события в PG, Gorse и Meilisearch

Решения по дизайну:
- Атрибуты — внутри category events как вложенный массив
- Review events — продюсер шлёт pre-computed `newRating` + `newReviewCount`
- `unlike` — часть `InteractionType`
- На уровне kernel нет owner — отдельные `organization` и `user` события. Discovery маппит оба в `OwnerReadModel`
- `ProductType` → `ItemType` везде
- Projection функции — в файлах read model

---

## 1. Widget VO в kernel

### `src/kernel/domain/vo/widget.ts` (NEW)

Все типы виджетов и связанные VO в одном файле:

```ts
import type { AttributeId, CategoryId, FileId, OrganizationId } from '../ids.js';
import type { AgeGroup } from './role.js';

// --- Связанные VO ---

export type PaymentStrategy = 'free' | 'one-time' | 'subscription';

export type ScheduleEntry = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

// --- Widget types ---

export type BaseInfoWidget = { type: 'base-info'; title: string; description: string; imageId: FileId | null };
export type AgeGroupWidget = { type: 'age-group'; value: AgeGroup };
export type LocationWidget = { type: 'location'; cityId: string; lat: number; lng: number; address: string | null };
export type PaymentWidget = { type: 'payment'; strategy: PaymentStrategy; price: number | null };
export type CategoryWidget = { type: 'category'; categoryIds: CategoryId[]; attributes: { attributeId: AttributeId; value: string }[] };
export type OwnerWidget = { type: 'owner'; organizationId: OrganizationId; name: string; avatarId: FileId | null };
export type ItemReviewWidget = { type: 'item-review'; rating: number | null; reviewCount: number };
export type OwnerReviewWidget = { type: 'owner-review'; rating: number | null; reviewCount: number };
export type EventDateTimeWidget = { type: 'event-date-time'; dates: string[] };
export type ScheduleWidget = { type: 'schedule'; entries: ScheduleEntry[] };

export type ItemWidget =
  | BaseInfoWidget | AgeGroupWidget | LocationWidget | PaymentWidget
  | CategoryWidget | OwnerWidget | ItemReviewWidget | OwnerReviewWidget
  | EventDateTimeWidget | ScheduleWidget;

export type WidgetType = ItemWidget['type'];
```

Используется в: `item.events.ts`, `ItemReadModel`, `ItemTypeReadModel`. `InteractionType` — в `interaction.events.ts` рядом с событием.

### Обновления существующих read models

- `ItemReadModel`: `ScheduleEntry`, `PaymentStrategy` → импорт из `@/kernel/domain/vo/widget.js` (удалить локальные определения)
- `ItemReadModel.ItemOwner`: убрать `ownerId` + `type`, заменить на `organizationId: OrganizationId`
- `OwnerReadModel`: остаётся для организаций (основной) и пользователей (для отображения)
- `ItemTypeReadModel` (бывший ProductTypeReadModel): `WidgetType` → импорт из `@/kernel/domain/vo/widget.js` (удалить локальное определение)

---

## 2. Domain Events в kernel

### `src/kernel/domain/events/item.events.ts` (NEW)

Виджеты и связанные VO вынесены в `widget.ts`. Events импортируют оттуда:

```ts
import type { ServiceId, TypeId, OrganizationId } from '../ids.js';
export type { ItemWidget } from '../vo/widget.js';

export type ItemPublishedEvent = {
  type: 'item.published';
  itemId: ServiceId;
  typeId: TypeId;
  organizationId: OrganizationId;
  widgets: ItemWidget[];
  publishedAt: Date;
};

export type ItemUpdatedEvent = {
  type: 'item.updated';
  itemId: ServiceId;
  typeId: TypeId;
  organizationId: OrganizationId;
  widgets: ItemWidget[];
  updatedAt: Date;
};

export type ItemUnpublishedEvent = {
  type: 'item.unpublished';
  itemId: ServiceId;
  unpublishedAt: Date;
};

export type ItemIntegrationEvent = ItemPublishedEvent | ItemUpdatedEvent | ItemUnpublishedEvent;
```

### `src/kernel/domain/events/category.events.ts` (NEW)

Атрибуты вложены в payload:

```ts
import type { AttributeId, CategoryId, FileId, TypeId } from '../ids.js';
import type { AttributeSchema } from '../vo/attribute.js';

export type CategoryAttribute = {
  attributeId: AttributeId;
  name: string;
  required: boolean;
  schema: AttributeSchema;
};

export type CategoryCreatedEvent = {
  type: 'category.created';
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];
  attributes: CategoryAttribute[];
  createdAt: Date;
};

export type CategoryUpdatedEvent = {
  type: 'category.updated';
  categoryId: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  ancestorIds: CategoryId[];
  attributes: CategoryAttribute[];
  updatedAt: Date;
};

export type CategoryDeletedEvent = {
  type: 'category.deleted';
  categoryId: CategoryId;
  deletedAt: Date;
};

export type CategoryIntegrationEvent = CategoryCreatedEvent | CategoryUpdatedEvent | CategoryDeletedEvent;
```

### `src/kernel/domain/events/item-type.events.ts` (NEW)

```ts
import type { TypeId } from '../ids.js';
import type { WidgetType } from '../vo/widget.js';

export type ItemTypeCreatedEvent = {
  type: 'item-type.created';
  typeId: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  createdAt: Date;
};

export type ItemTypeUpdatedEvent = {
  type: 'item-type.updated';
  typeId: TypeId;
  name: string;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  updatedAt: Date;
};

export type ItemTypeIntegrationEvent = ItemTypeCreatedEvent | ItemTypeUpdatedEvent;
```

`WidgetType` импортируется из `@/kernel/domain/vo/widget.js`.

### `src/kernel/domain/events/organization.events.ts` (NEW)

```ts
import type { FileId, OrganizationId } from '../ids.js';

export type OrganizationPublishedEvent = {
  type: 'organization.published';
  organizationId: OrganizationId;
  name: string;
  avatarId: FileId | null;
  republished: boolean; // true = повторная публикация (обновление данных через модерацию)
  publishedAt: Date;
};

export type OrganizationUnpublishedEvent = {
  type: 'organization.unpublished';
  organizationId: OrganizationId;
  unpublishedAt: Date;
};

export type OrganizationIntegrationEvent =
  | OrganizationPublishedEvent
  | OrganizationUnpublishedEvent;
```

### `src/kernel/domain/events/user.events.ts` (NEW)

```ts
import type { FileId, UserId } from '../ids.js';

export type UserCreatedEvent = {
  type: 'user.created';
  userId: UserId;
  name: string;
  avatarId: FileId | null;
  createdAt: Date;
};

export type UserUpdatedEvent = {
  type: 'user.updated';
  userId: UserId;
  name: string;
  avatarId: FileId | null;
  updatedAt: Date;
};

export type UserDeletedEvent = {
  type: 'user.deleted';
  userId: UserId;
  deletedAt: Date;
};

export type UserIntegrationEvent =
  | UserCreatedEvent
  | UserUpdatedEvent
  | UserDeletedEvent;
```

> Discovery маппит оба в `OwnerReadModel`: organization → `{ ownerId: organizationId, ownerType: 'organization', ... }`, user → `{ ownerId: userId, ownerType: 'user', ... }`.
> `published` → upsert в OwnerReadModel (начальные данные). `unpublished` → delete из OwnerReadModel + каскадные действия (удалить товары владельца из discovery).

### `src/kernel/domain/events/review.events.ts` (NEW)

```ts
import type { OrganizationId, ServiceId } from '../ids.js';

export type ReviewTarget =
  | { targetType: 'item'; itemId: ServiceId }
  | { targetType: 'organization'; organizationId: OrganizationId };

export type ReviewCreatedEvent = {
  type: 'review.created';
  reviewId: string;
  target: ReviewTarget;
  newRating: number | null;
  newReviewCount: number;
  createdAt: Date;
};

export type ReviewDeletedEvent = {
  type: 'review.deleted';
  reviewId: string;
  target: ReviewTarget;
  newRating: number | null;
  newReviewCount: number;
  deletedAt: Date;
};

export type ReviewIntegrationEvent = ReviewCreatedEvent | ReviewDeletedEvent;
```

### `src/kernel/domain/events/interaction.events.ts` (NEW)

```ts
import type { ServiceId, UserId } from '../ids.js';

export type InteractionType = 'view' | 'click' | 'like' | 'unlike' | 'purchase' | 'booking';

export type InteractionRecordedEvent = {
  type: 'interaction.recorded';
  userId: UserId;
  itemId: ServiceId;
  interactionType: InteractionType;
  timestamp: Date;
};

export type UserInteractionIntegrationEvent = InteractionRecordedEvent;
```

---

## 3. Read Models + Projection Functions (domain)

Функции проекции добавляются в файлы read model.

### `src/features/discovery/domain/read-models/item.read-model.ts` (MODIFY)

Добавить в конец файла:

```ts
import type { ItemPublishedEvent, ItemUpdatedEvent, ItemWidget } from '@/kernel/domain/events/item.events.js';

export function projectItemFromEvent(event: ItemPublishedEvent | ItemUpdatedEvent): ItemReadModel {
  const model: ItemReadModel = {
    itemId: event.itemId,
    typeId: event.typeId,
    publishedAt: event.type === 'item.published' ? event.publishedAt : event.updatedAt,
    updatedAt: event.type === 'item.published' ? event.publishedAt : event.updatedAt,
  };

  for (const widget of event.widgets) {
    switch (widget.type) {
      case 'base-info':
        model.baseInfo = { title: widget.title, description: widget.description, imageId: widget.imageId };
        break;
      case 'age-group': model.ageGroup = widget.value; break;
      case 'location':
        model.location = { cityId: widget.cityId, coordinates: { lat: widget.lat, lng: widget.lng }, address: widget.address };
        break;
      case 'payment': model.payment = { strategy: widget.strategy, price: widget.price }; break;
      case 'category': model.category = { categoryIds: widget.categoryIds, attributeValues: widget.attributes }; break;
      case 'owner':
        model.owner = { organizationId: widget.organizationId, name: widget.name, avatarId: widget.avatarId };
        break;
      case 'item-review': model.itemReview = { rating: widget.rating, reviewCount: widget.reviewCount }; break;
      case 'owner-review': model.ownerReview = { rating: widget.rating, reviewCount: widget.reviewCount }; break;
      case 'event-date-time': model.eventDateTime = { dates: widget.dates.map(d => new Date(d)) }; break;
      case 'schedule': model.schedule = { entries: widget.entries }; break;
    }
  }
  return model;
}
```

### `src/features/discovery/domain/read-models/category.read-model.ts` (MODIFY)

Добавить:

```ts
import type { CategoryCreatedEvent, CategoryUpdatedEvent } from '@/kernel/domain/events/category.events.js';

export function projectCategory(event: CategoryCreatedEvent | CategoryUpdatedEvent): CategoryReadModel {
  return {
    categoryId: event.categoryId,
    parentCategoryId: event.parentCategoryId,
    name: event.name,
    iconId: event.iconId,
    allowedTypeIds: event.allowedTypeIds,
    ancestorIds: event.ancestorIds,
    createdAt: event.type === 'category.created' ? event.createdAt : event.updatedAt, // при update сохраняем старый
    updatedAt: event.type === 'category.created' ? event.createdAt : event.updatedAt,
  };
}
```

### `src/features/discovery/domain/read-models/attribute.read-model.ts` (MODIFY)

```ts
import type { CategoryAttribute } from '@/kernel/domain/events/category.events.js';

export function projectAttributes(categoryId: CategoryId, attrs: CategoryAttribute[], now: Date): AttributeReadModel[] {
  return attrs.map(a => ({
    attributeId: a.attributeId, categoryId, name: a.name,
    required: a.required, schema: a.schema, createdAt: now, updatedAt: now,
  }));
}
```

### `src/features/discovery/domain/read-models/item-type.read-model.ts` (RENAME from product-type.read-model.ts + MODIFY)

- Переименовать `ProductTypeReadModel` → `ItemTypeReadModel`
- Добавить проекцию:

```ts
import type { ItemTypeCreatedEvent, ItemTypeUpdatedEvent } from '@/kernel/domain/events/item-type.events.js';

export function projectItemType(event: ItemTypeCreatedEvent | ItemTypeUpdatedEvent): ItemTypeReadModel {
  return {
    typeId: event.typeId, name: event.name,
    availableWidgetTypes: event.availableWidgetTypes,
    requiredWidgetTypes: event.requiredWidgetTypes,
    createdAt: event.type === 'item-type.created' ? event.createdAt : event.updatedAt,
    updatedAt: event.type === 'item-type.created' ? event.createdAt : event.updatedAt,
  };
}
```

### `src/features/discovery/domain/read-models/owner.read-model.ts` (MODIFY)

```ts
import type { OrganizationPublishedEvent } from '@/kernel/domain/events/organization.events.js';
import type { UserCreatedEvent, UserUpdatedEvent } from '@/kernel/domain/events/user.events.js';

export function projectOwnerFromOrganization(event: OrganizationPublishedEvent): OwnerReadModel {
  return {
    ownerId: OwnerId.raw(event.organizationId), ownerType: 'organization',
    name: event.name, avatarId: event.avatarId,
    rating: null, reviewCount: 0, // rating приходит отдельным review событием
    updatedAt: event.publishedAt,
  };
}

export function projectOwnerFromUser(event: UserCreatedEvent | UserUpdatedEvent): OwnerReadModel {
  return {
    ownerId: OwnerId.raw(event.userId), ownerType: 'user',
    name: event.name, avatarId: event.avatarId,
    rating: null, reviewCount: 0,
    updatedAt: event.type === 'user.created' ? event.createdAt : event.updatedAt,
  };
}
```

---

## 4. Application: Projection & Sync Ports

### `src/features/discovery/application/projection-ports.ts` (NEW)

```ts
export abstract class ItemProjectionPort {
  abstract upsert(item: ItemReadModel): Promise<void>;
  abstract delete(itemId: ServiceId): Promise<void>;
  abstract deleteByOrganizationId(organizationId: OrganizationId): Promise<ServiceId[]>;
  abstract updateOwnerData(organizationId: OrganizationId, data: { name: string; avatarId: FileId | null }): Promise<ServiceId[]>;
  abstract updateItemReview(itemId: ServiceId, rating: number | null, reviewCount: number): Promise<void>;
  abstract updateOwnerReview(organizationId: OrganizationId, rating: number | null, reviewCount: number): Promise<void>;
}

export abstract class CategoryProjectionPort {
  abstract upsert(category: CategoryReadModel): Promise<void>;
  abstract delete(categoryId: CategoryId): Promise<void>;
}

export abstract class ItemTypeProjectionPort {
  abstract upsert(itemType: ItemTypeReadModel): Promise<void>;
}

export abstract class OwnerProjectionPort {
  abstract upsert(owner: OwnerReadModel): Promise<void>;
  abstract delete(ownerId: OwnerId): Promise<void>;
}

export abstract class AttributeProjectionPort {
  abstract upsertBatch(categoryId: CategoryId, attributes: AttributeReadModel[]): Promise<void>;
  abstract deleteByCategoryId(categoryId: CategoryId): Promise<void>;
}

export abstract class UserLikeProjectionPort {
  abstract saveLike(userId: UserId, itemId: ServiceId, likedAt: Date): Promise<void>;
  abstract removeLike(userId: UserId, itemId: ServiceId): Promise<void>;
}

export abstract class IdempotencyPort {
  abstract isProcessed(eventId: string): Promise<boolean>;
  abstract markProcessed(eventId: string): Promise<void>;
}
```

### `src/features/discovery/application/sync-ports.ts` (NEW)

```ts
export abstract class GorseSyncPort {
  abstract upsertItem(item: ItemReadModel): Promise<void>;
  abstract deleteItem(itemId: ServiceId): Promise<void>;
  abstract sendFeedback(userId: UserId, itemId: ServiceId, feedbackType: string, timestamp: Date): Promise<void>;
  abstract deleteFeedback(userId: UserId, itemId: ServiceId, feedbackType: string): Promise<void>;
}

export abstract class MeilisearchSyncPort {
  abstract upsertItem(item: ItemReadModel): Promise<void>;
  abstract deleteItem(itemId: ServiceId): Promise<void>;
  abstract upsertItems(items: ItemReadModel[]): Promise<void>;
}
```

---

## 5. Application: Handlers

### `src/features/discovery/application/use-cases/project-item/project-item.handler.ts` (NEW)

```
@Injectable() class ProjectItemHandler
Dependencies: IdempotencyPort, ItemProjectionPort, GorseSyncPort, MeilisearchSyncPort

handleItemPublished(eventId, payload: ItemPublishedEvent):
  1. idempotency check
  2. projectItemFromEvent(payload) → ItemReadModel
  3. itemProjection.upsert(readModel)
  4. gorse.upsertItem(readModel)      // try/catch → DLQ
  5. meilisearch.upsertItem(readModel) // try/catch → DLQ
  6. idempotency.markProcessed(eventId)

handleItemUpdated — аналогично handleItemPublished

handleItemUnpublished(eventId, payload: ItemUnpublishedEvent):
  1. idempotency check
  2. itemProjection.delete(itemId)
  3. gorse.deleteItem(itemId)
  4. meilisearch.deleteItem(itemId)
  5. markProcessed
```

### `src/features/discovery/application/use-cases/project-category/project-category.handler.ts` (NEW)

```
@Injectable() class ProjectCategoryHandler
Dependencies: IdempotencyPort, CategoryProjectionPort, AttributeProjectionPort

handleCategoryCreated / handleCategoryUpdated:
  1. idempotency check
  2. projectCategory(event) → categoryProjection.upsert()
  3. projectAttributes(categoryId, attributes, now) → attributeProjection.upsertBatch()
  4. markProcessed

handleCategoryDeleted:
  1. categoryProjection.delete(categoryId)
  2. attributeProjection.deleteByCategoryId(categoryId)
```

### `src/features/discovery/application/use-cases/project-item-type/project-item-type.handler.ts` (NEW)

```
@Injectable() class ProjectItemTypeHandler
Dependencies: IdempotencyPort, ItemTypeProjectionPort

handleItemTypeCreated / handleItemTypeUpdated:
  1. idempotency check
  2. projectItemType(event) → itemTypeProjection.upsert()
  3. markProcessed
```

### `src/features/discovery/application/use-cases/project-owner/project-owner.handler.ts` (NEW)

Обрабатывает organization и user события, маппит в OwnerReadModel.

```
@Injectable() class ProjectOwnerHandler
Dependencies: IdempotencyPort, OwnerProjectionPort, ItemProjectionPort, ItemQueryPort,
              GorseSyncPort, MeilisearchSyncPort

handleOrganizationPublished(eventId, payload: OrganizationPublishedEvent):
  1. idempotency check
  2. projectOwnerFromOrganization(payload) → ownerProjection.upsert()
  3. if republished:
       itemProjection.updateOwnerData(organizationId, { name, avatarId }) → affectedItemIds
       itemQuery.findByIds(affectedItemIds) → meilisearch.upsertItems(items)
  4. markProcessed

handleOrganizationUnpublished(eventId, payload: OrganizationUnpublishedEvent):
  1. idempotency check
  2. ownerProjection.delete(organizationId)
  3. itemProjection.deleteByOrganizationId(organizationId) → affectedItemIds
  4. для каждого itemId: gorse.deleteItem(itemId), meilisearch.deleteItem(itemId)
  5. markProcessed

handleUserCreated(eventId, payload: UserCreatedEvent):
  1. idempotency check
  2. projectOwnerFromUser(payload) → ownerProjection.upsert()
  3. markProcessed

handleUserUpdated(eventId, payload: UserUpdatedEvent):
  1. idempotency check
  2. projectOwnerFromUser(payload) → ownerProjection.upsert()
  3. markProcessed
  (товары не привязаны к user — каскад не нужен)

handleUserDeleted(eventId, payload: UserDeletedEvent):
  1. idempotency check
  2. ownerProjection.delete(userId)
  3. markProcessed
  (товары не привязаны к user — каскад не нужен)
```

### `src/features/discovery/application/use-cases/project-review/project-review.handler.ts` (NEW)

```
@Injectable() class ProjectReviewHandler
Dependencies: IdempotencyPort, ItemProjectionPort

handleReviewCreated / handleReviewDeleted:
  1. idempotency check
  2. if target.targetType === 'item':
       itemProjection.updateItemReview(itemId, newRating, newReviewCount)
  3. if target.targetType === 'organization':
       itemProjection.updateOwnerReview(organizationId, newRating, newReviewCount)
  4. markProcessed
```

### `src/features/discovery/application/use-cases/project-interaction/project-interaction.handler.ts` (NEW)

```
@Injectable() class ProjectInteractionHandler
Dependencies: IdempotencyPort, GorseSyncPort, UserLikeProjectionPort

handleInteractionRecorded:
  1. idempotency check
  2. if interactionType !== 'unlike':
       gorse.sendFeedback(userId, itemId, interactionType, timestamp)
  3. if interactionType === 'like':
       userLikeProjection.saveLike(userId, itemId, timestamp)
  4. if interactionType === 'unlike':
       userLikeProjection.removeLike(userId, itemId)
       gorse.deleteFeedback(userId, itemId, 'like')
  5. markProcessed
```

---

## 6. Переименования и обновления

| Файл | Действие |
|------|----------|
| `domain/read-models/product-type.read-model.ts` | RENAME → `item-type.read-model.ts`, `ProductTypeReadModel` → `ItemTypeReadModel` |
| `domain/read-models/category-filters.read-model.ts` | Обновить импорт `ProductTypeReadModel` → `ItemTypeReadModel` если есть |
| `application/ports.ts` | Обновить импорты |
| `domain/events/user-interaction.event.ts` | УДАЛИТЬ — заменён на `kernel/domain/events/interaction.events.ts` |
| `discovery.module.ts` | Зарегистрировать handlers + projection/sync порты |

---

## 7. Полная сводка файлов

**Kernel VO (NEW):**
- `src/kernel/domain/vo/widget.ts` — все widget types + WidgetType, ScheduleEntry, PaymentStrategy

**Kernel Events (NEW):**
- `src/kernel/domain/events/envelope.ts`
- `src/kernel/domain/events/item.events.ts`
- `src/kernel/domain/events/category.events.ts`
- `src/kernel/domain/events/item-type.events.ts`
- `src/kernel/domain/events/organization.events.ts`
- `src/kernel/domain/events/user.events.ts`
- `src/kernel/domain/events/review.events.ts`
- `src/kernel/domain/events/interaction.events.ts`

**Discovery Domain (MODIFY):**
- `domain/read-models/item.read-model.ts` — добавить `projectItemFromEvent()`
- `domain/read-models/category.read-model.ts` — добавить `projectCategory()`
- `domain/read-models/attribute.read-model.ts` — добавить `projectAttributes()`
- `domain/read-models/product-type.read-model.ts` → RENAME `item-type.read-model.ts` + `projectItemType()`
- `domain/read-models/owner.read-model.ts` — добавить `projectOwnerFromOrganization()`, `projectOwnerFromUser()`

**Discovery Application (NEW):**
- `application/projection-ports.ts`
- `application/sync-ports.ts`
- `application/use-cases/project-item/project-item.handler.ts`
- `application/use-cases/project-category/project-category.handler.ts`
- `application/use-cases/project-item-type/project-item-type.handler.ts`
- `application/use-cases/project-owner/project-owner.handler.ts`
- `application/use-cases/project-review/project-review.handler.ts`
- `application/use-cases/project-interaction/project-interaction.handler.ts`

**Discovery (MODIFY/DELETE):**
- `domain/events/user-interaction.event.ts` — DELETE
- `discovery.module.ts` — MODIFY

---

## 8. Верификация

1. `npx tsc --noEmit` — все типы компилируются
2. Все handlers используют `@Inject(Port)` для abstract class портов (CLAUDE.md)
3. Value imports (не `import type`) для DI токенов
4. Unit-тесты для projection функций в read models (чистые функции)
5. Unit-тесты для handlers с мокнутыми портами

---

## Ключевые файлы для переиспользования

- `src/kernel/domain/events/service.events.ts` — паттерн discriminated union
- `src/kernel/domain/ids.ts` — все branded ID типы
- `src/kernel/domain/vo/attribute.ts` — `AttributeSchema`
- `src/features/discovery/application/ports.ts` — паттерн abstract class портов
- `src/features/discovery/domain/read-models/*.ts` — целевые read model типы

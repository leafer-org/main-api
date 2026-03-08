# Feature: Organization

## Business Context

Организация — сущность, которой принадлежат товары. У организации есть сотрудники, подписка и профиль, проходящий модерацию.

Товар (Item) — то, что публикуется в каталоге. Каждый товар описывается набором виджетов. Публикация и изменение опубликованного товара проходят через модерацию (внешняя тикет-система).

---

## Агрегаты

### 1. Organization

Единый агрегат, содержащий:

- **InfoDraft** — черновик профиля (name, description, avatarId). Мутабельный.
- **InfoPublication** — опубликованный снимок профиля. Иммутабельный. Создаётся после одобрения модерации. Заменяется при повторной модерации.
- **Employee[]** — сотрудники организации. Ровно один employee с `isOwner: true`.
- **EmployeeRole[]** — роли с набором пермишенов. Роль ADMIN создаётся автоматически, неудаляема.
- **Subscription** — подписка (planId, лимиты).

#### State

```ts
type OrganizationState = EntityState<{
  id: OrganizationId;

  // --- Info Draft / Publication ---
  infoDraft: {
    name: string;
    description: string;
    avatarId: FileId | null;
    status: 'draft' | 'moderation-request' | 'rejected';
  };
  infoPublication: {
    name: string;
    description: string;
    avatarId: FileId | null;
    publishedAt: Date;
  } | null;

  // --- Employees ---
  employees: Employee[];
  roles: EmployeeRole[];

  // --- Subscription ---
  subscription: {
    planId: SubscriptionPlanId;
    maxEmployees: number;
    maxPublishedItems: number;
    availableWidgetTypes: WidgetType[];  // виджеты доступные на этом плане
  };

  createdAt: Date;
  updatedAt: Date;
}>;

type Employee = {
  userId: UserId;
  roleId: EmployeeRoleId;
  isOwner: boolean;
  joinedAt: Date;
};

type EmployeeRole = {
  id: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
};
```

#### Subscription Plans (статические, в коде)

```ts
type SubscriptionPlanId = 'free' | 'individual' | 'team';

const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, {
  maxEmployees: number;
  maxPublishedItems: number;
  availableWidgetTypes: WidgetType[];
}> = {
  free: {
    maxEmployees: 1,
    maxPublishedItems: 3,
    availableWidgetTypes: ['base-info', 'age-group', 'location', 'payment', 'category', 'owner'],
  },
  individual: {
    maxEmployees: 1,
    maxPublishedItems: 20,
    availableWidgetTypes: [/* все базовые + расписание, отзывы и т.д. */],
  },
  team: {
    maxEmployees: 50,  // или зависит от оплаты
    maxPublishedItems: 100,
    availableWidgetTypes: [/* все */],
  },
};
```

#### Permissions (Organization-level)

Гранулярные права сотрудников внутри организации:

```ts
type OrganizationPermission =
  | 'manage_employees'        // добавлять/удалять сотрудников, менять их роли
  | 'manage_roles'            // создавать/удалять/редактировать роли
  | 'edit_organization'       // редактировать профиль организации (infoDraft)
  | 'publish_organization'    // отправить профиль организации на модерацию
  | 'edit_items'              // создавать/редактировать драфты товаров
  | 'publish_items'           // отправлять товары на модерацию
  | 'unpublish_items'         // снимать товары с публикации
  | 'manage_subscription';    // управлять подпиской
```

Роль **ADMIN** создаётся автоматически при создании организации. Содержит все пермишены. Создатель назначается сотрудником с ролью ADMIN и флагом `isOwner: true`.

#### Commands

```ts
// --- Lifecycle ---
type CreateOrganizationCommand = {
  type: 'CreateOrganization';
  id: OrganizationId;
  creatorUserId: UserId;
  name: string;
  description: string;
  avatarId: FileId | null;
  adminRoleId: EmployeeRoleId;
  now: Date;
};

// --- Info ---
type UpdateInfoDraftCommand = {
  type: 'UpdateInfoDraft';
  name: string;
  description: string;
  avatarId: FileId | null;
  now: Date;
};

type SubmitInfoForModerationCommand = {
  type: 'SubmitInfoForModeration';
  now: Date;
};

type ApproveInfoModerationCommand = {
  type: 'ApproveInfoModeration';
  eventId: string;
  now: Date;
};

type RejectInfoModerationCommand = {
  type: 'RejectInfoModeration';
  now: Date;
};

// --- Employees ---
type InviteEmployeeCommand = {
  type: 'InviteEmployee';
  userId: UserId;
  roleId: EmployeeRoleId;
  now: Date;
};

type RemoveEmployeeCommand = {
  type: 'RemoveEmployee';
  userId: UserId;
  now: Date;
};

type ChangeEmployeeRoleCommand = {
  type: 'ChangeEmployeeRole';
  userId: UserId;
  roleId: EmployeeRoleId;
  now: Date;
};

type TransferOwnershipCommand = {
  type: 'TransferOwnership';
  fromUserId: UserId;
  toUserId: UserId;
  now: Date;
};

// --- Roles ---
type CreateEmployeeRoleCommand = {
  type: 'CreateEmployeeRole';
  id: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
  now: Date;
};

type UpdateEmployeeRoleCommand = {
  type: 'UpdateEmployeeRole';
  roleId: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
  now: Date;
};

type DeleteEmployeeRoleCommand = {
  type: 'DeleteEmployeeRole';
  roleId: EmployeeRoleId;
  replacementRoleId: EmployeeRoleId;  // куда переназначить сотрудников
  now: Date;
};

// --- Subscription ---
type ChangeSubscriptionCommand = {
  type: 'ChangeSubscription';
  planId: SubscriptionPlanId;
  now: Date;
};

type DowngradeToFreeCommand = {
  type: 'DowngradeToFree';
  now: Date;
};
```

#### Events

```ts
// --- Lifecycle ---
type OrganizationCreatedEvent = {
  type: 'organization.created';
  id: OrganizationId;
  creatorUserId: UserId;
  name: string;
  description: string;
  avatarId: FileId | null;
  adminRoleId: EmployeeRoleId;
  createdAt: Date;
};

// --- Info ---
type InfoDraftUpdatedEvent = {
  type: 'organization.info-draft-updated';
  name: string;
  description: string;
  avatarId: FileId | null;
  updatedAt: Date;
};

type InfoSubmittedForModerationEvent = {
  type: 'organization.info-submitted-for-moderation';
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: FileId | null;
  submittedAt: Date;
};

type InfoModerationApprovedEvent = {
  type: 'organization.info-moderation-approved';
  eventId: string;
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: FileId | null;
  publishedAt: Date;
};

type InfoModerationRejectedEvent = {
  type: 'organization.info-moderation-rejected';
  rejectedAt: Date;
};

// --- Employees ---
type EmployeeInvitedEvent = {
  type: 'organization.employee-invited';
  userId: UserId;
  roleId: EmployeeRoleId;
  joinedAt: Date;
};

type EmployeeRemovedEvent = {
  type: 'organization.employee-removed';
  userId: UserId;
  removedAt: Date;
};

type EmployeeRoleChangedEvent = {
  type: 'organization.employee-role-changed';
  userId: UserId;
  roleId: EmployeeRoleId;
  updatedAt: Date;
};

type OwnershipTransferredEvent = {
  type: 'organization.ownership-transferred';
  fromUserId: UserId;
  toUserId: UserId;
  updatedAt: Date;
};

// --- Roles ---
type EmployeeRoleCreatedEvent = {
  type: 'organization.role-created';
  id: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
  createdAt: Date;
};

type EmployeeRoleUpdatedEvent = {
  type: 'organization.role-updated';
  roleId: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
  updatedAt: Date;
};

type EmployeeRoleDeletedEvent = {
  type: 'organization.role-deleted';
  roleId: EmployeeRoleId;
  replacementRoleId: EmployeeRoleId;
  deletedAt: Date;
};

// --- Subscription ---
type SubscriptionChangedEvent = {
  type: 'organization.subscription-changed';
  planId: SubscriptionPlanId;
  maxEmployees: number;
  maxPublishedItems: number;
  availableWidgetTypes: WidgetType[];
  updatedAt: Date;
};

type DowngradedToFreeEvent = {
  type: 'organization.downgraded-to-free';
  blockedEmployeeIds: UserId[];
  downgradedAt: Date;
};
```

#### Domain Rules (Invariants)

1. **ADMIN роль всегда существует** — создаётся при `CreateOrganization`, неудаляема (`DeleteEmployeeRole` с ADMIN → ошибка).
2. **Ровно один owner** — всегда ровно один employee с `isOwner: true`. Владелец неудаляем (`RemoveEmployee` с `isOwner === true` → ошибка).
3. **Лимит сотрудников** — `InviteEmployee` проверяет `employees.length < subscription.maxEmployees`.
4. **TransferOwnership** — новый владелец должен быть сотрудником организации. Переключает `isOwner` с одного employee на другого. Назначает новому владельцу роль ADMIN.
5. **Submit for moderation** — только из статуса `draft` или `rejected`.
6. **Approve moderation** — только из статуса `moderation-request`. Создаёт/заменяет `infoPublication`.
7. **Удаление роли** — все сотрудники с удаляемой ролью переназначаются на `replacementRoleId`.
8. **Downgrade** — при даунгрейде: сотрудники сверх лимита блокируются (событие содержит их ID), товары сверх лимита снимаются с публикации (через policy → Item aggregate).

#### Errors

```ts
class OrganizationNotFoundError extends CreateDomainError('organization_not_found', 404) {}
class CannotRemoveOwnerError extends CreateDomainError('cannot_remove_owner', 400) {}
class EmployeeNotFoundError extends CreateDomainError('employee_not_found', 404) {}
class EmployeeAlreadyExistsError extends CreateDomainError('employee_already_exists', 409) {}
class EmployeeLimitReachedError extends CreateDomainError('employee_limit_reached', 400) {}
class RoleNotFoundError extends CreateDomainError('role_not_found', 404) {}
class CannotDeleteAdminRoleError extends CreateDomainError('cannot_delete_admin_role', 400) {}
class InfoNotInDraftError extends CreateDomainError('info_not_in_draft', 400) {}
class InfoNotInModerationError extends CreateDomainError('info_not_in_moderation', 400) {}
class TransferTargetNotEmployeeError extends CreateDomainError('transfer_target_not_employee', 400) {}
```

---

### 2. Item

Агрегат товара. Содержит Draft и/или Publication как подсущности.

#### State

```ts
type ItemState = EntityState<{
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;

  draft: {
    widgets: ItemWidget[];
    status: 'draft' | 'moderation-request' | 'rejected';
    updatedAt: Date;
  } | null;

  publication: {
    widgets: ItemWidget[];
    publishedAt: Date;
  } | null;

  createdAt: Date;
  updatedAt: Date;
}>;
```

**Инвариант**: хотя бы одно из `draft` / `publication` всегда не null. Оба могут быть не null одновременно (опубликованный товар с новым черновиком на модерации).

#### Commands

```ts
// --- Lifecycle ---
type CreateItemCommand = {
  type: 'CreateItem';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  availableWidgetTypes: WidgetType[];   // из ItemType — для валидации
  requiredWidgetTypes: WidgetType[];    // из ItemType — для валидации
  allowedWidgetTypes: WidgetType[];     // из Subscription — для валидации лимитов плана
  now: Date;
};

type UpdateDraftCommand = {
  type: 'UpdateDraft';
  widgets: ItemWidget[];
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
  allowedWidgetTypes: WidgetType[];
  now: Date;
};

type DeleteDraftCommand = {
  type: 'DeleteDraft';
  now: Date;
};

// --- Moderation ---
type SubmitItemForModerationCommand = {
  type: 'SubmitItemForModeration';
  now: Date;
};

type ApproveItemModerationCommand = {
  type: 'ApproveItemModeration';
  eventId: string;
  now: Date;
};

type RejectItemModerationCommand = {
  type: 'RejectItemModeration';
  now: Date;
};

// --- Publication ---
type UnpublishItemCommand = {
  type: 'UnpublishItem';
  eventId: string;
  now: Date;
};
```

#### Events

```ts
// --- Lifecycle ---
type ItemCreatedEvent = {
  type: 'item.created';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  createdAt: Date;
};

type ItemDraftUpdatedEvent = {
  type: 'item.draft-updated';
  itemId: ItemId;
  widgets: ItemWidget[];
  updatedAt: Date;
};

type ItemDraftDeletedEvent = {
  type: 'item.draft-deleted';
  itemId: ItemId;
  deletedAt: Date;
};

// --- Moderation ---
type ItemSubmittedForModerationEvent = {
  type: 'item.submitted-for-moderation';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  submittedAt: Date;
};

// Integration event — публикация после модерации
// Реэкспортируется из kernel: ItemPublishedEvent
// { id, type: 'item.published', itemId, typeId, organizationId, widgets, republished, publishedAt }

type ItemModerationRejectedEvent = {
  type: 'item.moderation-rejected';
  itemId: ItemId;
  rejectedAt: Date;
};

// Integration event — снятие с публикации
// Реэкспортируется из kernel: ItemUnpublishedEvent
// { id, type: 'item.unpublished', itemId, unpublishedAt }

type ItemUnpublishedInternalEvent = {
  type: 'item.unpublished-internal';
  itemId: ItemId;
  widgets: ItemWidget[];  // данные для создания draft из publication
  unpublishedAt: Date;
};
```

#### Domain Rules (Invariants)

1. **CreateItem** — валидация виджетов:
   - Все `requiredWidgetTypes` должны присутствовать.
   - Все виджеты должны быть в `availableWidgetTypes` (для данного TypeId).
   - Все виджеты должны быть в `allowedWidgetTypes` (для данного плана подписки).
2. **UpdateDraft** — только если `draft !== null` и `draft.status !== 'moderation-request'`.
3. **DeleteDraft** — только если `draft !== null`. Если `publication === null` → удаление всего Item.
4. **SubmitItemForModeration** — только если `draft !== null` и `draft.status === 'draft' | 'rejected'`.
5. **ApproveItemModeration** — только если `draft !== null` и `draft.status === 'moderation-request'`.
   - Если `publication !== null` — заменяет publication (republished = true).
   - Если `publication === null` — создаёт publication (republished = false).
   - `draft` обнуляется.
6. **RejectItemModeration** — только если `draft.status === 'moderation-request'`. Статус → `rejected`.
7. **UnpublishItem** — только если `publication !== null`.
   - Удаляет publication.
   - Создаёт draft из данных publication (status = 'draft').
   - Публикует integration event `item.unpublished`.

#### Errors

```ts
class ItemNotFoundError extends CreateDomainError('item_not_found', 404) {}
class ItemNoDraftError extends CreateDomainError('item_no_draft', 400) {}
class ItemNoPublicationError extends CreateDomainError('item_no_publication', 400) {}
class ItemDraftInModerationError extends CreateDomainError('item_draft_in_moderation', 400) {}
class ItemDraftNotInModerationError extends CreateDomainError('item_draft_not_in_moderation', 400) {}
class MissingRequiredWidgetsError extends CreateDomainError('missing_required_widgets', 400)
  .withData<{ missing: WidgetType[] }>() {}
class InvalidWidgetTypesError extends CreateDomainError('invalid_widget_types', 400)
  .withData<{ invalid: WidgetType[] }>() {}
class WidgetNotAllowedByPlanError extends CreateDomainError('widget_not_allowed_by_plan', 403)
  .withData<{ disallowed: WidgetType[] }>() {}
class PublishedItemLimitReachedError extends CreateDomainError('published_item_limit_reached', 400) {}
```

---

## Policies

### 1. whenOrganizationDowngradedUnpublishExcessItems

**Trigger**: `organization.downgraded-to-free`
**Action**: Находит опубликованные товары организации сверх лимита нового плана. Для каждого лишнего товара вызывает `UnpublishItemCommand` (последние опубликованные снимаются первыми).

### 2. whenOrganizationInfoPublishedRepublishItems

**Trigger**: `organization.info-moderation-approved`
**Action**: Если у организации изменились name/avatarId — репаблишит все опубликованные товары (обновляет OwnerWidget).

### 3. whenOrganizationUnpublishedUnpublishAllItems

**Trigger**: При снятии организации с публикации (удаление infoPublication)
**Action**: Снимает с публикации все товары организации.

---

## Kernel Contracts

### Новые ID (в `kernel/domain/ids.ts`)

```ts
export type EmployeeRoleId = EntityId<'EmployeeRole'>;
export type SubscriptionPlanId = string; // 'free' | 'individual' | 'team' — пока статические

export const EmployeeRoleId = {
  raw(id: string): EmployeeRoleId { return id as EmployeeRoleId; }
};
```

### Integration Events (уже существуют в kernel)

- `OrganizationPublishedEvent` / `OrganizationUnpublishedEvent` — из `kernel/domain/events/organization.events.ts`
- `ItemPublishedEvent` / `ItemUnpublishedEvent` — из `kernel/domain/events/item.events.ts`

### Новые Integration Events

```ts
// kernel/domain/events/organization.events.ts — дополнить
type OrganizationModerationRequestedEvent = {
  id: string;
  type: 'organization.moderation-requested';
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: FileId | null;
  submittedAt: Date;
};

// kernel/domain/events/item.events.ts — дополнить
type ItemModerationRequestedEvent = {
  id: string;
  type: 'item.moderation-requested';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  widgets: ItemWidget[];
  submittedAt: Date;
};
```

### Kernel Port: CatalogValidationPort

Порт для валидации категорий и типов при создании/обновлении товара. Реализуется в CMS feature.

```ts
// kernel/application/ports/catalog-validation.ts
type ItemTypeInfo = {
  id: TypeId;
  availableWidgetTypes: WidgetType[];
  requiredWidgetTypes: WidgetType[];
};

abstract class CatalogValidationPort {
  abstract getItemType(typeId: TypeId): Promise<ItemTypeInfo | null>;
  abstract validateCategoryTypes(categoryIds: CategoryId[], typeId: TypeId): Promise<boolean>;
}
```

### Kernel Port: UserLookupPort

Порт для поиска пользователя по телефону (для приглашения сотрудников). Реализуется в IDP feature.

```ts
// kernel/application/ports/user-lookup.ts
abstract class UserLookupPort {
  abstract findByPhone(phone: string): Promise<{ userId: UserId } | null>;
}
```

---

## Application Layer

### OrganizationPermissionCheckService

Порт в application layer фичи organization. Проверяет пермишены сотрудника внутри организации:

```ts
abstract class OrganizationPermissionCheckService {
  abstract mustBeEmployee(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<Either<NotEmployeeError, Employee>>;

  abstract mustHavePermission(
    organizationId: OrganizationId,
    userId: UserId,
    permission: OrganizationPermission,
  ): Promise<Either<PermissionDeniedError, Employee>>;
}
```

### Interactors (Write)

| Use Case | Input | Domain Call | Events Published |
|----------|-------|-------------|-----------------|
| CreateOrganization | name, description, avatarId | `Organization.create()` | `organization.created` |
| UpdateInfoDraft | orgId, name, description, avatarId | `Organization.updateInfoDraft()` | `organization.info-draft-updated` |
| SubmitInfoForModeration | orgId | `Organization.submitInfoForModeration()` | `organization.info-submitted-for-moderation` → Kafka (moderation-requested) |
| ApproveInfoModeration | orgId (from external event) | `Organization.approveInfoModeration()` | `organization.published` (integration event) |
| RejectInfoModeration | orgId (from external event) | `Organization.rejectInfoModeration()` | `organization.info-moderation-rejected` |
| InviteEmployee | orgId, phone | lookup user → `Organization.inviteEmployee()` | `organization.employee-invited` |
| RemoveEmployee | orgId, userId | `Organization.removeEmployee()` | `organization.employee-removed` |
| ChangeEmployeeRole | orgId, userId, roleId | `Organization.changeEmployeeRole()` | `organization.employee-role-changed` |
| TransferOwnership | orgId, toUserId | `Organization.transferOwnership()` | `organization.ownership-transferred` |
| CreateEmployeeRole | orgId, name, permissions | `Organization.createEmployeeRole()` | `organization.role-created` |
| UpdateEmployeeRole | orgId, roleId, name, permissions | `Organization.updateEmployeeRole()` | `organization.role-updated` |
| DeleteEmployeeRole | orgId, roleId, replacementRoleId | `Organization.deleteEmployeeRole()` | `organization.role-deleted` |
| CreateItem | orgId, typeId, widgets | validate type+plan → `Item.create()` | `item.created` |
| UpdateItemDraft | itemId, widgets | validate type+plan → `Item.updateDraft()` | `item.draft-updated` |
| DeleteItemDraft | itemId | `Item.deleteDraft()` | `item.draft-deleted` |
| SubmitItemForModeration | itemId | check published limit → `Item.submitForModeration()` | `item.submitted-for-moderation` → Kafka (moderation-requested) |
| ApproveItemModeration | itemId (from external event) | `Item.approveModeration()` | `item.published` (integration event) |
| RejectItemModeration | itemId (from external event) | `Item.rejectModeration()` | `item.moderation-rejected` |
| UnpublishItem | itemId | `Item.unpublish()` | `item.unpublished` (integration event) |

### Handlers (Event-driven)

| Handler | Trigger Event | Action |
|---------|---------------|--------|
| ApproveInfoModerationHandler | `moderation.approved` (type=organization) | Calls ApproveInfoModeration interactor |
| RejectInfoModerationHandler | `moderation.rejected` (type=organization) | Calls RejectInfoModeration interactor |
| ApproveItemModerationHandler | `moderation.approved` (type=item) | Calls ApproveItemModeration interactor |
| RejectItemModerationHandler | `moderation.rejected` (type=item) | Calls RejectItemModeration interactor |
| UnpublishExcessItemsHandler | `organization.downgraded-to-free` | Policy → UnpublishItem for excess items |
| RepublishItemsOnOrgUpdateHandler | `organization.info-moderation-approved` | Republish items with updated OwnerWidget |

### Queries (Read)

| Query | Returns |
|-------|---------|
| GetOrganizationDetail | Полная информация об организации (для владельца/сотрудника) |
| GetOrganizationEmployees | Список сотрудников с ролями |
| GetOrganizationRoles | Список ролей с пермишенами |
| GetOrganizationItems | Список товаров (draft + publication status) |
| GetItemDetail | Детальная информация о товаре (draft + publication) |

### Ports

```ts
// --- Organization Repository ---
abstract class OrganizationRepository {
  abstract findById(tx: Transaction, id: OrganizationId): Promise<OrganizationState | null>;
  abstract save(tx: Transaction, state: OrganizationState): Promise<void>;
}

// --- Item Repository ---
abstract class ItemRepository {
  abstract findById(tx: Transaction, itemId: ItemId): Promise<ItemState | null>;
  abstract findByOrganizationId(tx: Transaction, orgId: OrganizationId): Promise<ItemState[]>;
  abstract findPublishedByOrganizationId(tx: Transaction, orgId: OrganizationId): Promise<ItemState[]>;
  abstract countPublishedByOrganizationId(tx: Transaction, orgId: OrganizationId): Promise<number>;
  abstract save(tx: Transaction, state: ItemState): Promise<void>;
  abstract delete(tx: Transaction, itemId: ItemId): Promise<void>;
}

// --- Event Publishers ---
abstract class OrganizationEventPublisher {
  abstract publishOrganizationPublished(tx: Transaction, event: OrganizationPublishedEvent): Promise<void>;
  abstract publishOrganizationUnpublished(tx: Transaction, event: OrganizationUnpublishedEvent): Promise<void>;
  abstract publishModerationRequested(tx: Transaction, event: OrganizationModerationRequestedEvent): Promise<void>;
}

abstract class ItemEventPublisher {
  abstract publishItemPublished(tx: Transaction, event: ItemPublishedEvent): Promise<void>;
  abstract publishItemUnpublished(tx: Transaction, event: ItemUnpublishedEvent): Promise<void>;
  abstract publishModerationRequested(tx: Transaction, event: ItemModerationRequestedEvent): Promise<void>;
}

// --- Query Ports ---
abstract class OrganizationQueryPort {
  abstract findDetail(id: OrganizationId): Promise<OrganizationDetailDto | null>;
  abstract findEmployees(id: OrganizationId): Promise<EmployeeDto[]>;
  abstract findRoles(id: OrganizationId): Promise<EmployeeRoleDto[]>;
}

abstract class ItemQueryPort {
  abstract findByOrganizationId(orgId: OrganizationId): Promise<ItemListDto[]>;
  abstract findDetail(itemId: ItemId): Promise<ItemDetailDto | null>;
}
```

---

## Kafka Topics

| Topic | Producer | Consumer | Events |
|-------|----------|----------|--------|
| `organization.streaming` | Organization feature | Discovery feature | `organization.published`, `organization.unpublished` |
| `item.streaming` | Organization feature | Discovery feature | `item.published`, `item.unpublished` |
| `organization.moderation` | Organization feature | Moderation feature (future) | `organization.moderation-requested` |
| `item.moderation` | Organization feature | Moderation feature (future) | `item.moderation-requested` |
| `moderation.results` | Moderation feature (future) | Organization feature | `moderation.approved`, `moderation.rejected` |

---

## File Structure

```
src/features/organization/
├── SPEC.md
├── organization.module.ts
│
├── domain/
│   ├── aggregates/
│   │   ├── organization/
│   │   │   ├── state.ts              (OrganizationState, Employee, EmployeeRole, Subscription types)
│   │   │   ├── commands.ts
│   │   │   ├── events.ts
│   │   │   ├── errors.ts
│   │   │   ├── config.ts             (SUBSCRIPTION_PLANS, ADMIN_ROLE_NAME, ALL_PERMISSIONS)
│   │   │   ├── entity.ts             (Organization decider)
│   │   │   └── entity.test.ts
│   │   │
│   │   └── item/
│   │       ├── state.ts              (ItemState, Draft, Publication)
│   │       ├── commands.ts
│   │       ├── events.ts
│   │       ├── errors.ts
│   │       ├── entity.ts             (Item decider)
│   │       └── entity.test.ts
│   │
│   └── policies/
│       ├── when-downgraded-unpublish-excess-items.ts
│       └── when-org-published-republish-items.ts
│
├── application/
│   ├── ports.ts
│   ├── organization-permission.ts
│   │
│   └── use-cases/
│       ├── organization/
│       │   ├── create-organization.interactor.ts
│       │   ├── update-info-draft.interactor.ts
│       │   ├── submit-info-for-moderation.interactor.ts
│       │   ├── invite-employee.interactor.ts
│       │   ├── remove-employee.interactor.ts
│       │   ├── change-employee-role.interactor.ts
│       │   ├── transfer-ownership.interactor.ts
│       │   ├── create-employee-role.interactor.ts
│       │   ├── update-employee-role.interactor.ts
│       │   └── delete-employee-role.interactor.ts
│       │
│       ├── item/
│       │   ├── create-item.interactor.ts
│       │   ├── update-item-draft.interactor.ts
│       │   ├── delete-item-draft.interactor.ts
│       │   ├── submit-item-for-moderation.interactor.ts
│       │   └── unpublish-item.interactor.ts
│       │
│       ├── handlers/
│       │   ├── approve-info-moderation.handler.ts
│       │   ├── reject-info-moderation.handler.ts
│       │   ├── approve-item-moderation.handler.ts
│       │   ├── reject-item-moderation.handler.ts
│       │   ├── unpublish-excess-items.handler.ts
│       │   └── republish-items-on-org-update.handler.ts
│       │
│       └── queries/
│           ├── get-organization-detail.query.ts
│           ├── get-organization-employees.query.ts
│           ├── get-organization-roles.query.ts
│           ├── get-organization-items.query.ts
│           └── get-item-detail.query.ts
│
└── adapters/
    ├── http/
    │   ├── organizations.controller.ts
    │   ├── organization-employees.controller.ts
    │   ├── organization-roles.controller.ts
    │   └── items.controller.ts
    │
    ├── db/
    │   ├── repositories/
    │   │   ├── organization.repository.ts
    │   │   └── item.repository.ts
    │   └── queries/
    │       ├── organization.query.ts
    │       └── item.query.ts
    │
    └── kafka/
        ├── contracts/
        │   ├── organization-streaming.contract.ts
        │   ├── item-streaming.contract.ts
        │   ├── organization-moderation.contract.ts
        │   ├── item-moderation.contract.ts
        │   └── moderation-results.contract.ts
        ├── publishers/
        │   ├── organization-event.publisher.ts
        │   └── item-event.publisher.ts
        ├── handlers/
        │   └── moderation-results.handler.ts
        └── consumer-ids.ts
```

---

## HTTP API

### Organization CRUD

```
POST   /organizations                          → CreateOrganization
GET    /organizations/:id                      → GetOrganizationDetail
PATCH  /organizations/:id                      → UpdateInfoDraft
POST   /organizations/:id/submit-for-moderation → SubmitInfoForModeration
```

### Employees

```
GET    /organizations/:id/employees            → GetOrganizationEmployees
POST   /organizations/:id/employees            → InviteEmployee (body: { phone })
DELETE /organizations/:id/employees/:userId     → RemoveEmployee
PATCH  /organizations/:id/employees/:userId     → ChangeEmployeeRole
POST   /organizations/:id/transfer-ownership    → TransferOwnership (body: { userId })
```

### Roles

```
GET    /organizations/:id/roles                → GetOrganizationRoles
POST   /organizations/:id/roles                → CreateEmployeeRole
PATCH  /organizations/:id/roles/:roleId        → UpdateEmployeeRole
DELETE /organizations/:id/roles/:roleId        → DeleteEmployeeRole (query: replacementRoleId)
```

### Items

```
POST   /organizations/:orgId/items             → CreateItem
GET    /organizations/:orgId/items             → GetOrganizationItems
GET    /organizations/:orgId/items/:itemId     → GetItemDetail
PATCH  /organizations/:orgId/items/:itemId     → UpdateItemDraft
DELETE /organizations/:orgId/items/:itemId     → DeleteItemDraft
POST   /organizations/:orgId/items/:itemId/submit-for-moderation → SubmitItemForModeration
POST   /organizations/:orgId/items/:itemId/unpublish             → UnpublishItem
```

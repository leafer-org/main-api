# Kernel — Связывание доменов

Kernel — общий слой, через который feature-домены взаимодействуют между собой. Содержит shared ID, value objects, integration events и application-порты.

**Правило**: feature **не импортирует** другую feature напрямую. Вся коммуникация — через kernel.

---

## Структура

```
kernel/
├── domain/
│   ├── ids.ts                ← все ID агрегатов проекта
│   ├── permissions.ts        ← глобальные пермишены
│   ├── vo/                   ← shared value objects
│   │   ├── role.ts
│   │   ├── attribute.ts
│   │   └── service-component.ts
│   └── events/               ← integration events
│       ├── service.events.ts
│       └── attribute.events.ts
└── application/
    └── ports/                ← shared application ports
        ├── tx-host.ts        ← Transaction abstraction
        ├── media.ts          ← MediaService port
        ├── permission.ts     ← PermissionCheckService port
        └── session-validation.ts
```

---

## Branded IDs (`@/kernel/domain/ids.ts`)

Все ID агрегатов проекта определяются **только здесь**. Branded-типы через `EntityId<Brand>`.

```ts
import type { EntityId } from '@/infra/ddd/entity.js';

export type UserId = EntityId<'User'>;
export type SessionId = EntityId<'Session'>;
export type RoleId = EntityId<'Role'>;
export type FileId = EntityId<'File'>;
export type ServiceId = EntityId<'Service'>;
export type CategoryId = EntityId<'Category'>;
export type AttributeId = EntityId<'Attribute'>;
export type OrganizationId = EntityId<'Organization'>;

// Companion object для каждого ID
export const UserId = {
  raw(id: string): UserId { return id as UserId; },
};
```

Новый агрегат → добавляем его ID сюда.

---

## Shared Value Objects (`@/kernel/domain/vo/`)

Value Objects, которые используются в нескольких feature.

### Role

```ts
export type Role = ValueObject<string, 'Role'>;

export const Role = {
  default(): Role { return 'USER' as Role; },
  raw(role: string): Role { return role as Role; },
};
```

### AttributeSchema

```ts
export type AttributeSchema =
  | { type: 'text' }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'enum'; options: string[] }
  | { type: 'boolean' };
```

### ServiceComponent

Discriminated union по `type`:

```ts
export type ServiceComponent =
  | BaseInfoComponent    // title, description, photoId
  | AgeGroupComponent    // value: 'children' | 'adults' | 'all'
  | CategoryComponent    // categoryId, attributes
  | OrganizationComponent
  | LocationComponent;   // cityId, lat, lng, address
```

---

## Integration Events (`@/kernel/domain/events/`)

События для межфичерной коммуникации. Публикуются через Kafka, потребляются handler'ами в других feature.

```ts
// service.events.ts
export type ServicePublishedEvent = {
  type: 'service.published';
  serviceId: ServiceId;
  components: ServiceComponent[];
  publishedAt: Date;
};

export type ServiceIntegrationEvent =
  | ServicePublishedEvent
  | ServiceUpdatedEvent
  | ServiceUnpublishedEvent;
```

```ts
// attribute.events.ts
export type AttributeCreatedEvent = {
  type: 'attribute.created';
  attributeId: AttributeId;
  categoryId: CategoryId;
  name: string;
  schema: AttributeSchema;
  createdAt: Date;
};

export type AttributeIntegrationEvent =
  | AttributeCreatedEvent
  | AttributeUpdatedEvent
  | AttributeDeletedEvent;
```

### Отличие от domain events

| | Domain Event | Integration Event |
|---|---|---|
| **Область** | Внутри feature | Между feature |
| **Где живёт** | `feature/domain/aggregates/*/events.ts` | `kernel/domain/events/` |
| **Транспорт** | Синхронно (в interactor'е) | Kafka |
| **Типы** | Содержат domain VO | Содержат kernel VO |

---

## Application Ports (`@/kernel/application/ports/`)

Абстрактные порты, реализация которых предоставляется feature, а используется несколькими feature.

### TransactionHost

```ts
export type Transaction = { type: 'transaction' } | { type: 'no-transaction' };
export const NO_TRANSACTION = { type: 'no-transaction' } as const;

export abstract class TransactionHost {
  public abstract startTransaction<T>(
    cb: (transaction: Transaction, isolationLevel?: IsolationLevel) => Promise<T>,
  ): Promise<T>;
}
```

- `Transaction` — opaque-тип, передаётся в repository-методы
- `NO_TRANSACTION` — для read-операций вне транзакции

### MediaService

```ts
export abstract class MediaService {
  public abstract getDownloadUrl(fileId: FileId, options: GetDownloadUrlOptions): Promise<string | null>;
  public abstract useFiles(tx: Transaction, fileIds: FileId[]): Promise<void>;
  public abstract freeFiles(tx: Transaction, fileIds: FileId[]): Promise<void>;
}
```

Реализуется в media feature, используется в других feature.

### PermissionCheckService

```ts
export abstract class PermissionCheckService {
  public abstract can<T extends PermissionVariant>(perm: T, ...args: WhereArg<InferPermissionValue<T>>): boolean;
  public abstract mustCan<T extends PermissionVariant>(perm: T, ...args: WhereArg<InferPermissionValue<T>>): Either<PermissionDeniedError, void>;
}
```

Проверка прав доступа в interactor'ах. Реализуется в infra/auth, использует роль из текущей сессии.

### SessionValidationPort

```ts
export abstract class SessionValidationPort {
  public abstract exists(tx: Transaction, sessionId: SessionId): Promise<boolean>;
}
```

Реализуется в idp feature, используется в auth guard.

---

## Permissions (`@/kernel/domain/permissions.ts`)

Глобальная карта пермишенов проекта:

```ts
export const Permissions = {
  manageSession: EnumPerm('SESSION.MANAGE', ['self', 'all'] as const, 'self'),
  manageRole: BooleanPerm('ROLE.MANAGE', false),
  manageUser: BooleanPerm('USER.MANAGE', false),
} as const;
```

Используется в interactor'ах:

```ts
const authEither = this.permissionCheck.mustCan(Permissions.manageRole);
if (isLeft(authEither)) return authEither;
```

---

## Правила kernel

1. **Только типы и абстракции** — никакой конкретной реализации
2. **Не зависит от feature** — feature зависит от kernel, не наоборот
3. **ID агрегатов** — определяются только в `kernel/domain/ids.ts`
4. **Integration events** — определяются в `kernel/domain/events/`
5. **Shared VO** — если VO используется в 2+ feature, переносится в `kernel/domain/vo/`
6. **Application ports** — если порт используется в 2+ feature, определяется в `kernel/application/ports/`
7. **Feature-specific VO** остаётся в `feature/domain/vo/`

---

## Зависимости между слоями

```
kernel/domain     ← infra/ddd (примитивы)
kernel/application ← kernel/domain
feature/domain    ← kernel/domain, infra/ddd
feature/application ← feature/domain, kernel/application
feature/adapters  ← feature/application, infra/lib
```

Feature **никогда** не импортирует другую feature.

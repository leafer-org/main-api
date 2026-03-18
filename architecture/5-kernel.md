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

function createEntityId<T extends EntityId<string>>() {
  return { raw(id: string): T { return id as T; } };
}

export type MediaId = EntityId<'Media'>;
export type UserId = EntityId<'User'>;
export type SessionId = EntityId<'Session'>;
export type RoleId = EntityId<'Role'>;
export type ServiceId = EntityId<'Service'>;
export type ItemId = EntityId<'Item'>;
export type CategoryId = EntityId<'Category'>;
export type AttributeId = EntityId<'Attribute'>;
export type OrganizationId = EntityId<'Organization'>;
export type TypeId = EntityId<'Type'>;
export type EmployeeRoleId = EntityId<'EmployeeRole'>;
export type TicketId = EntityId<'Ticket'>;
export type BoardId = EntityId<'Board'>;
export type ReviewId = EntityId<'Review'>;

export const MediaId = createEntityId<MediaId>();
// ... аналогично для всех остальных
```

Новый агрегат → добавляем его ID сюда. Используем `createEntityId<T>()` — хелпер, генерирующий companion object с методом `raw()`.

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
export type MediaVisibility = 'PUBLIC' | 'PRIVATE';

export type ImageProxyOptions = {
  width?: number; height?: number; quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
};

export type GetDownloadUrlOptions = {
  visibility: MediaVisibility;
  imageProxy?: ImageProxyOptions;
};

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type VideoStreamInfo = {
  hlsUrl: string | null;
  thumbnailUrl: string | null;
  status: ProcessingStatus;
  duration: number | null;
};

export abstract class MediaService {
  // --- Файлы (изображения и видео) ---
  public abstract getDownloadUrl(fileId: MediaId, options: GetDownloadUrlOptions): Promise<string | null>;
  public abstract getDownloadUrls(requests: { fileId: MediaId; options: GetDownloadUrlOptions }[]): Promise<(string | null)[]>;
  public abstract getPreviewDownloadUrl(fileId: MediaId): Promise<string | null>;
  public abstract useFiles(tx: Transaction, fileIds: MediaId[]): Promise<void>;
  public abstract freeFiles(tx: Transaction, fileIds: MediaId[]): Promise<void>;

  // --- Видео ---
  public abstract getVideoStreamInfo(mediaId: MediaId): Promise<VideoStreamInfo | null>;
  public abstract getVideoStatus(mediaId: MediaId): Promise<ProcessingStatus | null>;

  // --- Batch-загрузчик URL ---
  public createDownloadUrlsLoader(options: GetDownloadUrlOptions): DownloadUrlLoader;
}
```

`DownloadUrlLoader` — батч-загрузчик URL через `queueMicrotask`. Собирает запросы в текущем тике, отправляет одним батчем `getDownloadUrls`. Используется в query-резолверах для N+1-оптимизации.

```ts
const loader = mediaService.createDownloadUrlsLoader({ visibility: 'PUBLIC' });
const url = await loader.get(mediaId); // батчится автоматически
```

Реализуется в media feature (`MediaServiceAdapter`), используется в других feature. `MediaModule` — `@Global()`, поэтому порт доступен без явного импорта модуля.

#### Методы

| Метод | Назначение |
|-------|-----------|
| `getDownloadUrl` | Presigned URL для одного файла (с опциональным imgproxy) |
| `getDownloadUrls` | Batch-версия для нескольких файлов |
| `getPreviewDownloadUrl` | URL для временного файла (из temp-бакета) |
| `useFiles` | Перемещает файлы из temp → permanent бакет |
| `freeFiles` | Удаляет файлы из хранилища |
| `getVideoStreamInfo` | HLS URL + thumbnail URL + статус + длительность |
| `getVideoStatus` | Только статус обработки видео |
| `createDownloadUrlsLoader` | Batch-загрузчик URL (для query-резолверов) |

#### Интеграция модулей с MediaService

Когда feature хранит ссылку на медиа (аватар, фото, видео), она должна управлять жизненным циклом через `MediaService`:

- **`useFiles(tx, mediaIds)`** — перемещает файл из temp-хранилища в постоянное. Вызывать при привязке файла к агрегату.
- **`freeFiles(tx, mediaIds)`** — удаляет файл из хранилища. Вызывать при отвязке/замене файла.
- **`getDownloadUrl(mediaId, options)`** / **`getDownloadUrls(...)`** — получение URL для клиента.

**Рекомендация**: вызывать `useFiles`/`freeFiles` в **репозитории** (в методе `save()`), а не в interactor'е — так жизненный цикл файла гарантированно обрабатывается при любом сохранении агрегата.

**Пример** (IDP — аватар пользователя):

```ts
// user.repository.ts
@Injectable()
export class DrizzleUserRepository implements UserRepository {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) { super(); }

  public async save(tx: Transaction, state: UserState): Promise<void> {
    // 1. Прочитать старый avatarId
    const oldRows = await db.select({ avatarFileId: users.avatarFileId })
      .from(users).where(eq(users.id, state.id)).limit(1);
    const oldAvatarId = oldRows[0]?.avatarFileId
      ? MediaId.raw(oldRows[0].avatarFileId) : undefined;

    // 2. Upsert с новым avatarFileId
    await db.insert(users).values({ ..., avatarFileId: state.avatarId ?? null })
      .onConflictDoUpdate({ ... });

    // 3. Управление файлами
    if (state.avatarId && state.avatarId !== oldAvatarId) {
      await this.mediaService.useFiles(tx, [state.avatarId]);
    }
    if (oldAvatarId && oldAvatarId !== state.avatarId) {
      await this.mediaService.freeFiles(tx, [oldAvatarId]);
    }
  }
}
```

**DI**: `MediaService` — abstract class, поэтому нужен value import и `@Inject(MediaService)`:

```ts
import { MediaService } from '@/kernel/application/ports/media.js';  // value import!
```

**Домен** работает только с `MediaId` — не знает про URL, хранилище или MediaService.

#### Видео в других feature

Для отображения видео-контента (HLS-стримы) в другой feature используется `getVideoStreamInfo`:

```ts
// В query/projection другой feature
const info = await this.mediaService.getVideoStreamInfo(mediaId);
// info: { hlsUrl, thumbnailUrl, status: 'ready', duration: 120 }
```

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

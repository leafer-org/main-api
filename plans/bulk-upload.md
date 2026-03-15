# Bulk Upload: Организации + Товары из JSON

## Context

Фаза 3 из `plans/admin-organizations.md`. Нужна массовая загрузка организаций и товаров из JSON (формат удобный для LLM). Два дополнительных требования:
1. **Публичный эндпоинт** с JSON Schema для нейронки
2. **Скачивание картинок** по URL из виджетов → S3

---

## Шаг 1: S3 — добавить `putObject` для серверной загрузки

**`src/features/media/adapters/s3/s3-client.service.ts`** — добавить `PutObjectCommand` import + метод:
```ts
public async putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>
```

**`src/features/media/application/ports.ts`** — добавить в `FileStorageService`:
```ts
public abstract uploadBuffer(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
```

**`src/features/media/adapters/s3/file-storage.service.ts`** — реализация `uploadBuffer` → делегирует в `s3.putObject()`.

---

## Шаг 2: `uploadFromUrl` — kernel port + interactor

**`src/kernel/application/ports/media.ts`** — добавить в `MediaService`:
```ts
public abstract uploadFromUrl(tx: Transaction, url: string): Promise<FileId>;
```

**Создать `src/features/media/application/use-cases/upload/upload-from-url.interactor.ts`:**
- `fetch()` с `AbortController` таймаут 10с
- Валидация Content-Type (image/jpeg, image/png, image/webp, image/avif)
- Валидация размера (`MediaConfig.maxFileSize`)
- Генерация `FileId` через `FileIdGenerator`
- `fileDecide(null, UploadFile)` → `fileApply()` → `FileRepository.save(tx, state)`
- `FileStorageService.uploadBuffer(publicBucket, fileId, buffer, mimeType)` — прямо в permanent bucket
- `fileDecide(state, UseFile)` → `fileApply()` → save (marks `isTemporary: false`)
- Возвращает `FileId`
- При ошибке бросает исключение (caller ловит)

Инжекты: `Clock`, `FileRepository`, `FileStorageService`, `FileIdGenerator`, `MediaConfig`.

**`src/features/media/adapters/media/media.service.ts`** — реализация `uploadFromUrl` делегирует в `UploadFromUrlInteractor`.

**`src/features/media/media.module.ts`** — зарегистрировать `UploadFromUrlInteractor`.

---

## Шаг 3: TypeBox Schema

**Создать `src/features/organization/adapters/http/bulk-upload-schema.ts`:**

Описать схему через TypeBox (`import { Type } from 'typebox'`). TypeBox схемы — это одновременно TypeScript типы и JSON Schema-совместимые объекты.

```ts
import { Type, type Static } from 'typebox';

const BulkOrganizationSchema = Type.Object({
  ref: Type.String({ description: 'Локальный ключ для связки с товарами' }),
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  avatarUrl: Type.Optional(Type.Union([Type.String({ format: 'uri' }), Type.Null()])),
});

const BaseInfoDataSchema = Type.Object({
  title: Type.String(),
  description: Type.String(),
  imageUrl: Type.Optional(Type.Union([Type.String({ format: 'uri' }), Type.Null()])),
});

// ... per-widget-type data schemas ...

const BulkWidgetSchema = Type.Object({
  type: Type.String(),
  data: Type.Record(Type.String(), Type.Unknown()),
});

const BulkItemSchema = Type.Object({
  orgRef: Type.String({ description: 'ref из organizations[] или UUID существующей' }),
  typeId: Type.String(),
  widgets: Type.Array(BulkWidgetSchema),
});

export const BulkUploadSchema = Type.Object({
  organizations: Type.Array(BulkOrganizationSchema),
  items: Type.Array(BulkItemSchema),
});

export type BulkUploadInput = Static<typeof BulkUploadSchema>;
```

Эндпоинт `GET /admin/organizations/bulk-upload/schema` возвращает `BulkUploadSchema` напрямую — TypeBox объект уже является валидным JSON Schema.

Описания полей на русском для LLM — через `description` в Type options.

---

## Шаг 4: `AdminBulkUploadInteractor`

**Создать `src/features/organization/application/use-cases/manage-org/admin-bulk-upload.interactor.ts`:**

Инжекты: `PermissionCheckService`, `OrganizationRepository`, `ItemRepository`, `CatalogValidationPort`, `TransactionHost`, `Clock`, `MediaService`.

Логика:
1. `permissionCheck.mustCan(Permissions.manageOrganization)`
2. **Организации** — последовательно, каждая в своей транзакции:
   - Если `avatarUrl` → `mediaService.uploadFromUrl(tx, url)` → `FileId`
   - Inline логика из `AdminCreateOrganizationInteractor` (entity.adminCreate + save)
   - Построение маппинга `ref → { organizationId, claimToken }`
   - Ошибка одной не прерывает остальные
3. **Товары** — последовательно, каждый в своей транзакции:
   - Резолв `orgRef` → `organizationId` (из маппинга или как UUID существующей)
   - Обход виджетов: если `base-info` и есть `imageUrl` → `mediaService.uploadFromUrl(tx, url)` → подставить `imageId`
   - Inline логика из `AdminCreateItemInteractor` (catalogValidation + ItemEntity.create + save)
   - `allowedWidgetTypes: ALL_WIDGET_TYPES` (обход лимитов плана)
4. Возвращает `{ organizations: ResultEntry[], items: ResultEntry[] }`

Каждый `ResultEntry`: `{ ref/orgRef, status: 'success' | 'error', organizationId?, claimToken?, itemId?, error? }`

Переиспользуемые функции:
- `OrganizationEntity.adminCreate()` — `src/features/organization/domain/aggregates/organization/entity.ts`
- `ItemEntity.create()` — `src/features/organization/domain/aggregates/item/entity.ts`
- `CatalogValidationPort.getItemType()` — `src/kernel/application/ports/catalog-validation.ts`
- `ALL_WIDGET_TYPES` — вынести из `admin-create-item.interactor.ts` или дублировать

---

## Шаг 5: OpenAPI контракты

**`http-contracts/endpoints/organization/admin-organizations.yaml`** — добавить:
- `adminBulkUpload` (POST) — request body + response с массивами результатов
- `adminBulkUploadSchema` (GET) — response `type: object` (JSON Schema)

**`http-contracts/main.yaml`** — добавить пути:
```yaml
/admin/organizations/bulk-upload:
  post:
    $ref: "./endpoints/organization/admin-organizations.yaml#/adminBulkUpload"
/admin/organizations/bulk-upload/schema:
  get:
    $ref: "./endpoints/organization/admin-organizations.yaml#/adminBulkUploadSchema"
```

**ВАЖНО:** Пути `/admin/organizations/bulk-upload` и `/admin/organizations/bulk-upload/schema` должны стоять **выше** `/admin/organizations/{id}/regenerate-token` в main.yaml, чтобы `{id}` не матчил `bulk-upload`.

Запустить `yarn openapi`.

---

## Шаг 6: Controller + Module

**`src/features/organization/adapters/http/admin-organizations.controller.ts`:**

```ts
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { BulkUploadSchema } from './bulk-upload-schema.js';
```

Добавить:
- `@Get('bulk-upload/schema') @Public()` — возвращает `BulkUploadSchema` (TypeBox объект = JSON Schema)
- `@Post('bulk-upload')` — вызывает `AdminBulkUploadInteractor.execute()`

**Порядок маршрутов:** `bulk-upload/schema` и `bulk-upload` объявить **до** `:id/regenerate-token` и `:orgId/items`.

Инжект `AdminBulkUploadInteractor` в конструктор.

**`src/features/organization/organization.module.ts`** — зарегистрировать `AdminBulkUploadInteractor`.

---

## Шаг 7: E2E тесты

**`src/test/e2e/features/organization/admin-organizations.e2e-spec.ts`** — добавить:
1. `GET /admin/organizations/bulk-upload/schema` → 200, returns valid JSON schema (без авторизации)
2. `POST /admin/organizations/bulk-upload` → 403 без прав
3. `POST /admin/organizations/bulk-upload` → успешное создание орг-ий + товаров, проверка claimToken в ответе
4. Partial failure — невалидный `typeId` для одного товара, остальные создаются

---

## Порядок реализации

1. S3 putObject + uploadBuffer (шаг 1)
2. uploadFromUrl interactor + MediaService port (шаг 2)
3. JSON Schema файл (шаг 3)
4. AdminBulkUploadInteractor (шаг 4)
5. OpenAPI контракты + `yarn openapi` (шаг 5)
6. Controller + Module wiring (шаг 6)
7. E2E тесты (шаг 7)

---

## Верификация

1. `yarn openapi` — без ошибок
2. `yarn build` — компиляция без ошибок
3. E2E тесты: `yarn test:e2e -- --grep "bulk"` (или как настроен vitest)
4. `GET /admin/organizations/bulk-upload/schema` — возвращает JSON Schema без авторизации
5. `POST /admin/organizations/bulk-upload` — создаёт организации и товары с правильными claim tokens

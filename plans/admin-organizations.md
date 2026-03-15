# Feature: Создание организаций из админки + QR для привязки владельца + Bulk Upload

## Концепция

Сейчас админ-панель позволяет только искать организации по ID и модерировать их. Нужно дать возможность:
1. **Создавать организации** без владельца, генерировать одноразовый QR/ссылку для привязки владельца
2. **Создавать товары** для организаций, обходя ограничения тарифного плана
3. **Массовая загрузка** организаций и товаров из JSON (удобный для LLM формат), каждая запись модерируется отдельно

Приоритет: Фаза 1 (создание орг-ий + QR) в первую очередь. Фазы 2-3 поверх.

---

## Фаза 1: Создание организаций из админки + QR Claim

### 1.1 Domain — новые команды, события, ошибки

**Файлы:**
- `src/features/organization/domain/aggregates/organization/commands.ts`
- `src/features/organization/domain/aggregates/organization/events.ts`
- `src/features/organization/domain/aggregates/organization/errors.ts`
- `src/features/organization/domain/aggregates/organization/entity.ts`

**Новые команды:**
```ts
AdminCreateOrganizationCommand { id, name, description, avatarId, adminRoleId, claimToken, now }
ClaimOrganizationCommand { claimToken, userId, now }
RegenerateClaimTokenCommand { newToken, now }
```

**Новые события:**
```ts
organization.admin-created { id, name, description, avatarId, adminRoleId, claimToken, createdAt }
organization.claimed { userId, claimedAt }
organization.claim-token-regenerated { newToken, regeneratedAt }
```

**Новые ошибки:**
```ts
OrganizationAlreadyClaimedError — орг-ия уже привязана (claimToken === null)
InvalidClaimTokenError — токен не совпадает
```

**Изменения в entity:**
- Добавить `claimToken: string | null` в тип состояния `OrganizationEntity`
- `OrganizationEntity.adminCreate()` — создаёт орг-ию с `employees: []`, `claimToken` установлен, admin role создана, free plan
- `OrganizationEntity.claim()` — валидирует токен, ставит `claimToken = null`, добавляет owner employee
- `OrganizationEntity.regenerateClaimToken()` — валидирует что орг-ия не привязана, заменяет токен
- Существующий `OrganizationEntity.create()` — просто добавить `claimToken: null` в state (поведение не меняется)

### 1.2 Permissions

**Файл:** `src/kernel/domain/permissions.ts`

Добавить:
```ts
manageOrganization: BooleanPerm('ORGANIZATION.MANAGE', false)
```

Закрывает: создание орг-ий админом, создание товаров админом, bulk upload, перегенерацию claim token.

### 1.3 DB Schema

**Файл:** `src/features/organization/adapters/db/schema.ts`

Добавить колонку `claimToken: text('claim_token')` в таблицу `organizations` для индексного поиска. Уникальный индекс на `claim_token`.

Repository `save()` извлекает `claimToken` из state и пишет в колонку. `toDomain()` читает обратно. Удалить папку drizzle и перегенерировать миграцию (pre-production).

### 1.4 Application — новые интеракторы и порт

**Файлы:**
- `src/features/organization/application/ports.ts` — добавить `ClaimTokenQueryPort`
- `src/features/organization/application/use-cases/manage-org/admin-create-organization.interactor.ts`
- `src/features/organization/application/use-cases/manage-org/claim-organization.interactor.ts`
- `src/features/organization/application/use-cases/manage-org/regenerate-claim-token.interactor.ts`

**ClaimTokenQueryPort** (abstract class):
```ts
findOrganizationByClaimToken(tx, token): Promise<OrganizationEntity | null>
```

**AdminCreateOrganizationInteractor:**
- Проверяет `Permissions.manageOrganization` через `PermissionCheckService`
- Генерирует `claimToken = crypto.randomUUID()`
- Вызывает `OrganizationEntity.adminCreate()`
- Сохраняет, возвращает `{ organizationId, claimToken }`

**ClaimOrganizationInteractor:**
- Без проверки прав — любой авторизованный пользователь
- Ищет орг-ию по `ClaimTokenQueryPort.findOrganizationByClaimToken()`
- Вызывает `OrganizationEntity.claim()`
- Сохраняет, возвращает деталь организации

**RegenerateClaimTokenInteractor:**
- Проверяет `Permissions.manageOrganization`
- Генерирует новый токен, вызывает `OrganizationEntity.regenerateClaimToken()`

### 1.5 Adapters — DB query, контроллеры

**Новые файлы:**
- `src/features/organization/adapters/db/queries/claim-token.query.ts` — реализация `ClaimTokenQueryPort`
- `src/features/organization/adapters/http/admin-organizations.controller.ts`

**Эндпоинты админ-контроллера:**
- `POST /admin/organizations` — body: `{ id, name, description?, avatarId? }` → возвращает `{ id, claimToken }`
- `POST /admin/organizations/:id/regenerate-token` → возвращает `{ claimToken }`

**Добавление в существующий контроллер:**
- `POST /organizations/claim` в `organizations.controller.ts` — body: `{ token }` → возвращает деталь орг-ии

**Обновить:** `src/features/organization/adapters/db/repositories/organization.repository.ts` — обработка `claimToken` в save/load

### 1.6 HTTP Contracts (OpenAPI)

**Новые/обновлённые файлы:**
- `http-contracts/endpoints/organization/admin-organizations.yaml` — новый
- `http-contracts/endpoints/organization/organizations.yaml` — добавить `claimOrganization`
- `http-contracts/main.yaml` — зарегистрировать новые пути

Затем `yarn openapi` для перегенерации типов.

### 1.7 Регистрация в модуле

**Файл:** `src/features/organization/organization.module.ts`

Зарегистрировать:
- `AdminOrganizationsController`
- `AdminCreateOrganizationInteractor`
- `ClaimOrganizationInteractor`
- `RegenerateClaimTokenInteractor`
- `{ provide: ClaimTokenQueryPort, useClass: DrizzleClaimTokenQuery }`

### 1.8 Админ-панель

**Новые файлы в `admin/src/features/organizations/`:**
- `model/use-admin-create-org.ts` — мутация `POST /admin/organizations`
- `model/use-regenerate-token.ts` — мутация `POST /admin/organizations/:id/regenerate-token`
- `model/use-create-org-form.ts` — состояние формы (name, description, avatar)
- `ui/create-org-dialog.tsx` — UI формы (dumb component с children slot)
- `ui/claim-qr-dialog.tsx` — показывает claim URL + QR код (библиотека `qrcode.react`)
- `compose/create-org-compose.tsx` — связывает форму + мутацию + диалоги

**Изменить:**
- `compose/organization-screen.tsx` — добавить кнопку "Создать организацию"
- `ui/org-info-card.tsx` — показывать claim token/QR для непривязанных орг-ий

**Новая зависимость:** `qrcode.react` в admin `package.json`

---

## Фаза 2: Создание товаров админом (обход лимитов)

### 2.1 Application

**Новый файл:** `src/features/organization/application/use-cases/manage-items/admin-create-item.interactor.ts`

- Проверяет `Permissions.manageOrganization` (глобальное, не уровня орг-ии)
- Загружает орг-ию (валидация `organizationId`)
- Загружает тип товара через `CatalogValidationPort`
- Вызывает `ItemEntity.create()` с `allowedWidgetTypes` = ВСЕ типы виджетов (обход лимитов плана)
- Не проверяет лимит опубликованных товаров
- Сохраняет и возвращает

### 2.2 Adapters + Contracts

- Добавить `POST /admin/organizations/:orgId/items` в `AdminOrganizationsController`
- Добавить `adminCreateItem` в `http-contracts/endpoints/organization/admin-organizations.yaml`
- Обновить `main.yaml`, запустить `yarn openapi`
- Зарегистрировать интерактор в модуле

### 2.3 Админ-панель

- Добавить UI создания товара в детальном виде орг-ии (на карточке товаров)
- Переиспользовать паттерны виджет-форм из существующего редактирования товаров, если есть

---

## Фаза 3: Массовая загрузка (JSON, удобный для LLM)

### 3.1 Схема JSON

```json
{
  "organizations": [
    {
      "ref": "org-1",
      "name": "Название организации",
      "description": "Опционально",
      "avatarId": null
    }
  ],
  "items": [
    {
      "orgRef": "org-1",
      "typeId": "uuid",
      "widgets": [
        { "type": "base-info", "data": { "title": "...", "description": "..." } }
      ]
    }
  ]
}
```

- `ref` — локальный ключ для связки товаров с орг-иями внутри одной загрузки
- `orgRef` — либо `ref` из `organizations[]`, либо UUID существующей орг-ии
- Каждая орг-ия получает свой claim token
- Каждый товар обходит лимиты плана (создание админом)

### 3.2 Application

**Новый файл:** `src/features/organization/application/use-cases/manage-org/bulk-upload.interactor.ts`

- Проверяет `Permissions.manageOrganization`
- Обрабатывает организации последовательно, строит маппинг `ref → organizationId`
- Обрабатывает товары, резолвит `orgRef` → `organizationId`
- Каждая запись независима (ошибка одной не прерывает остальные)
- Возвращает результат по каждой записи со статусом/ошибкой

### 3.3 Adapters + Contracts

- `POST /admin/organizations/bulk-upload` в `AdminOrganizationsController`
- Новая операция в YAML, обновить `main.yaml`, `yarn openapi`

### 3.4 Админ-панель

- `ui/bulk-upload-dialog.tsx` — textarea для вставки JSON или загрузка файла
- `model/use-bulk-upload.ts` — мутация
- Таблица результатов: статус по каждой записи, claim tokens для новых орг-ий

---

## Проверка

1. **Unit тесты:** `OrganizationEntity.adminCreate()`, `.claim()`, `.regenerateClaimToken()` — чистые функции, проверить все пути ошибок
2. **E2E тесты:**
   - Админ создаёт орг-ию → получает claim token → пользователь привязывается → становится owner
   - Админ создаёт товар обходя лимиты плана
   - Bulk upload с микс орг-ий/товаров
3. **Админ-панель:** ручное тестирование flow создания орг-ии, отображение QR, привязка по ссылке
4. Запустить `yarn openapi` после изменений YAML
5. Удалить `drizzle/` и перегенерировать миграцию после изменения схемы

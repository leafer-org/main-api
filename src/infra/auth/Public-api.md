# infra/auth — Public API

## Структура

- `authn/` — аутентификация (JWT, guard, decorator, filter)
- `session/` — сессионный контекст (абстракция + ALS-реализация)
- `authz/` — авторизация (permission schema, store, services)

## Для контроллеров (HTTP layer) — `authn/`

- `JwtAuthGuard` — гвард аутентификации, `@UseGuards(JwtAuthGuard)`
- `CurrentUser` — param decorator, `@CurrentUser() user: JwtUserPayload`
- `JwtUserPayload` — тип `{ userId, role, sessionId }`

## Для use-case layer — `authz/`

- `PermissionCheckService` — порт из `kernel/application/ports/permission.ts`
  - `can(perm, ...args): boolean`
  - `mustCan(perm, ...args): Either<PermissionDeniedError, void>`
- `PermissionsStore` — абстрактный store для ролевых permissions

## Для инфраструктуры

- `ClsService` (`nestjs-cls`) — доступ к контексту текущего запроса (JWT-сессия)
- `AuthModule` — NestJS модуль, импортировать в `AppModule`

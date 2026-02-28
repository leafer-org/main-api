# infra/auth — Public API

## Для контроллеров (HTTP layer)

- `JwtAuthGuard` — гвард аутентификации, `@UseGuards(JwtAuthGuard)`
- `CurrentUser` — param decorator, `@CurrentUser() user: JwtUserPayload`
- `JwtUserPayload` — тип `{ userId, role, sessionId }`
- `PermissionGuard` — гвард проверки пермишенов (из `infra/lib/authorization`)
- `RequirePermission` — decorator, `@RequirePermission((can) => can(Permissions.xxx))`

## Для use-case layer

- `PermissionCheckService` — порт из `kernel/application/ports/permission.ts`
  - `can(perm, ...args): boolean`
  - `mustCan(perm, ...args): Either<PermissionDeniedError, void>`

## Для инфраструктуры

- `JwtSessionStorage` — доступ к текущей JWT-сессии через AsyncLocalStorage
- `AuthModule` — NestJS модуль, импортировать в `AppModule`

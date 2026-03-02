# infra/auth — Public API

## Для контроллеров (HTTP layer)

- `JwtAuthGuard` — гвард аутентификации, `@UseGuards(JwtAuthGuard)`
- `CurrentUser` — param decorator, `@CurrentUser() user: JwtUserPayload`
- `JwtUserPayload` — тип `{ userId, role, sessionId }`
## Для use-case layer

- `PermissionCheckService` — порт из `kernel/application/ports/permission.ts`
  - `can(perm, ...args): boolean`
  - `mustCan(perm, ...args): Either<PermissionDeniedError, void>`

## Для инфраструктуры

- `ClsService` (`nestjs-cls`) — доступ к контексту текущего запроса (JWT-сессия)
- `AuthModule` — NestJS модуль, импортировать в `AppModule`

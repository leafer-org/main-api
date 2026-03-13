# CLAUDE.md — Project Guidelines

## HTTP-контракты (OpenAPI)

При изменении request/response body эндпоинтов:
1. Обнови YAML в `http-contracts/endpoints/` (и `http-contracts/shared/` для общих схем)
2. Запусти `yarn openapi` — это бандлит YAML → JSON и генерирует `generated-public-schema.d.ts`
3. Контроллеры используют `PublicBody` / `PublicResponse` из `@/infra/contracts/types.js` — после перегенерации типы подхватятся автоматически

## Работа с миграциями

Сервис ещё не в production. Что бы изменить схему, просто удали папку drizzle и сгенерируй миграцию заново
## Запуск e2e тестов

Запускай минимум тестов. Толькое те которые затронуты или тебя их попросили запустить

## Архитектура — Functional Decider

Проект построен на Hexagonal Architecture + CQRS + функциональном Decider-паттерне.

## Разделы

1. **[Domain](architecture/1-domain.md)** — агрегаты (Decide + Apply), state, events, commands, value objects, policies, read models
2. **[Application](architecture/2-application.md)** — use cases, interactors, handlers, queries, порты, проверка прав
3. **[Adapters](architecture/adapters/*.md)** — HTTP-контроллеры, DB-репозитории, Kafka publishers, регистрация в модулях
4. **[Infra](architecture/4-infra.md)** — Either/Box, DDD-примитивы, Clock, Drizzle, Authorization, Kafka, Outbox, Search
5. **[Kernel](architecture/5-kernel.md)** — shared IDs, value objects, integration events, application ports, permissions
6. **[Kernel](architecture/6-test.md)** — документация e2e тестов

## Зависимости между слоями

```
kernel/domain     ← infra/ddd
kernel/application ← kernel/domain
feature/domain    ← kernel/domain, infra/ddd
feature/application ← feature/domain, kernel/application
feature/adapters  ← feature/application, infra/lib
```

Feature **никогда** не импортирует другую feature. Вся коммуникация — через kernel.

## Features

| Feature | Назначение |
|---------|-----------|
| `idp` | Identity Provider — авторизация, пользователи, роли, сессии |
| `media` | Файлы и хранилище (S3) |
| `discovery` | Каталог сервисов и поиск |

## NestJS Dependency Injection

### Always use explicit `@Inject()` for abstract class tokens

When a constructor parameter type is an **abstract class** used as a DI token, always add `@Inject(Token)` explicitly. Do NOT rely on `emitDecoratorMetadata` implicit resolution — it breaks when the import is `import type` (which erases the reference at runtime).

```ts
// GOOD
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '@/infra/lib/clock.js';               // value import
import { FileRepository } from '../ports.js';                // value import

@Injectable()
export class MyInteractor {
  public constructor(
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FileRepository) private readonly repo: FileRepository,
  ) {}
}
```

```ts
// BAD — breaks at runtime
import type { Clock } from '@/infra/lib/clock.js';           // erased at runtime
import type { FileRepository } from '../ports.js';           // erased at runtime

@Injectable()
export class MyInteractor {
  public constructor(
    private readonly clock: Clock,          // NestJS sees Object
    private readonly repo: FileRepository,  // NestJS sees Object
  ) {}
}
```

### Port pattern: abstract class as DI token + `implements` in adapters

Ports (repository/service interfaces) are defined as **abstract classes** so they exist at runtime and can be used as NestJS DI tokens. Adapters use `implements` (not `extends`) to avoid `super()` calls:

```ts
// ports.ts
export abstract class FileRepository {
  public abstract findById(id: string): Promise<File | null>;
}

// file.repository.ts
@Injectable()
export class DrizzleFileRepository implements FileRepository {
  public findById(id: string): Promise<File | null> { /* ... */ }
}

// module.ts
{ provide: FileRepository, useClass: DrizzleFileRepository }
```

### Rules summary

1. **Ports** — define as `abstract class`, not `interface`
2. **Imports** — use value `import`, not `import type`, for anything used as a DI token
3. **`@Inject(Token)`** — always add for abstract class / cross-module tokens
4. **Module registration** — always use `{ provide: AbstractPort, useClass: ConcreteAdapter }`
5. **Adapters** — use `implements`, not `extends`, for port abstract classes

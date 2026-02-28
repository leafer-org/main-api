# CLAUDE.md — Project Guidelines

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

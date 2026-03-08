# HTTP (Controllers)

Тонкий слой между HTTP и application. Инъектирует interactor'ы (не порты напрямую).

## Workflow создания контроллера

### 1. Описать контракт в `@pl-openapi`

Определить endpoint в OpenAPI-спецификации (репозиторий `pl-openapi`):
- path, method, operationId
- request body / query params (JSON Schema)
- response schemas для всех кодов (200, 201, 400, 401, 404 и т.д.)

`operationId` — ключ, по которому типизируются body, response и ошибки в коде.

### 2. Сгенерировать типы

```bash
npm run gen-api
```

Генерирует `generated-public-schema.d.ts` и `generated-public-schema.json` в `src/infra/contracts/`. Оба репозитория (`main-api` и `pl-openapi`) должны лежать в одной родительской директории.

### 3. Использовать сгенерированные типы в контроллере

Импорты:

```ts
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
```

Типизация параметров и возвращаемого значения через `operationId`:

```ts
@Post('action')
@HttpCode(200)
public async action(
  @Body() body: PublicBody['operationId'],
): Promise<PublicResponse['operationId']> {
  // ...
}
```

Для query-параметров:

```ts
@Get('list')
public async list(
  @Query() query: PublicQuery['operationId'],
): Promise<PublicResponse['operationId']> {
  // ...
}
```

### 4. Типизировать ошибки через `domainToHttpError`

`domainToHttpError<K>` принимает generic-параметр `K` — `operationId` из OpenAPI-схемы. Это гарантирует, что передаваемые HTTP-коды и тела ошибок соответствуют контракту.

**Ошибки из domain (Either/Box):**

```ts
const result = await this.interactor.execute(params);

if (isLeft(result)) {
  throw domainToHttpError<'operationId'>(result.error.toResponse());
}
```

`toResponse()` возвращает объект `{ statusCode: { type, isDomain, ...fields } }`, где ключ — HTTP-код, значение — тело ответа по контракту.

**Ошибки напрямую (без domain):**

```ts
if (!refreshToken) {
  throw domainToHttpError<'refresh'>({
    401: { type: 'missing_refresh_token', isDomain: true },
  });
}
```

**Перехват неизвестных ошибок:**

```ts
try {
  // ...
} catch (error) {
  if (error instanceof HttpException) throw error;
  throw domainToHttpError<'operationId'>({ 401: { type: 'invalid_token', isDomain: true } });
}
```

## Полный пример контроллера

```ts
import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';

import { MyInteractor } from '../../application/use-cases/my.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';

@Controller('resource')
export class ResourceController {
  public constructor(
    private readonly myInteractor: MyInteractor,
    @Inject(SomePort) private readonly somePort: SomePort,
  ) {}

  @Public()
  @Post('create')
  @HttpCode(200)
  public async create(
    @Body() body: PublicBody['createResource'],
  ): Promise<PublicResponse['createResource']> {
    const result = await this.myInteractor.execute({ name: body.name });

    if (isLeft(result)) {
      throw domainToHttpError<'createResource'>(result.error.toResponse());
    }

    return result.value;
  }

  @Get()
  public async getResource(
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getResource']> {
    const result = await this.myInteractor.execute({ userId: user.userId });

    if (isLeft(result)) {
      throw domainToHttpError<'getResource'>(result.error.toResponse());
    }

    return result.value;
  }
}
```

## Правила

- `@Public()` — для эндпоинтов без авторизации; остальные требуют JWT по умолчанию
- `@HttpCode(200)` — явно указывать для POST (NestJS по умолчанию возвращает 201)
- `@HttpCode(204)` — для delete/logout, возвращаемый тип `Promise<void>`
- `@Inject(Port)` — обязателен для abstract class DI-токенов (см. CLAUDE.md)
- Не использовать `import type` для DI-токенов
- Текущий пользователь: `@CurrentUser()` декоратор → `JwtUserPayload`
- Контроллер регистрируется в `controllers: [...]` модуля фичи

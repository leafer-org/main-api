# Infra — Инфраструктура и практики

Инфраструктурный слой предоставляет кросс-cutting сервисы: DDD-примитивы, БД, авторизация, Kafka, поиск. Живёт в `src/infra/`.

---

## Структура

```
infra/
├── ddd/                     ← DDD-примитивы
│   ├── entity.ts            ← Entity base class
│   ├── value-object.ts      ← ValueObject branded type
│   ├── error.ts             ← CreateDomainError
│   ├── event.ts             ← DomainEvent types
│   ├── read-model.ts        ← ReadModel type
│   └── utils.ts             ← assertNever
├── lib/
│   ├── box.ts               ← Either/Option monad
│   ├── clock.ts             ← Clock abstraction
│   ├── authorization/       ← RBAC-система
│   ├── nest-drizzle/        ← Database module
│   ├── nest-kafka/          ← Kafka consumer/producer
│   ├── nest-outbox/         ← Transactional outbox
│   └── nest-search/         ← Meilisearch module
├── db/
│   └── tx-host-pg.ts        ← PostgreSQL TransactionHost
├── auth/                    ← JWT guards, session storage
├── config/                  ← ConfigService
└── contracts/               ← OpenAPI types, apiError()
```

---

## Either / Box (`@/infra/lib/box.js`)

Основа обработки ошибок. Используется вместо исключений для бизнес-ошибок.

```ts
type Either<L, R> = Left<L> | Right<R>;
type Option<T> = Right<T> | Empty;
type Box<L, R> = Left<L> | Right<R> | Empty;
```

### API

| Функция | Описание |
|---------|----------|
| `Left(error)` | Создать ошибку |
| `Right(value)` | Создать успех |
| `isLeft(box)` | Проверка на ошибку |
| `isRight(box)` | Проверка на успех |
| `mapRight(either, fn)` | Трансформация значения |
| `mapLeft(either, fn)` | Трансформация ошибки |
| `joinEithers(...eithers)` | Объединить массив Either (fail-fast) |
| `joinEithersAggregated(...)` | Объединить с накоплением ошибок |
| `pipe(value, fn1, fn2, ...)` | Пайплайн трансформаций |
| `unwrap(box)` | Извлечь значение или throw |

---

## DDD-примитивы (`@/infra/ddd/`)

### CreateDomainError

```ts
// Без данных
class InvalidOtpError extends CreateDomainError('invalid_otp') {}

// С данными
class OtpThrottleError extends CreateDomainError('otp_throttle').withData<{
  retryAfterSec: number;
}>() {}

new OtpThrottleError({ retryAfterSec: 30 });
```

### ValueObject

```ts
type PhoneNumber = ValueObject<string, 'PhoneNumber'>;

const PhoneNumber = {
  create(value: string): Either<Error, PhoneNumber> { /* ... */ },
  raw(value: string): PhoneNumber { return value as PhoneNumber; },
};
```

### Entity (legacy)

```ts
abstract class Entity<T extends { id: EntityId<string> }> {
  constructor(protected readonly state: Readonly<T>) {}
  get id(): T['id'];
  toJson(): Readonly<T>;
  static equals(a: Entity, b: Entity): boolean;
}

type EntityId<B> = string & { __entityIdBrand: B };
```

> Для новых агрегатов используется функциональный подход (Decide + Apply), а не Entity-класс.

### assertNever

```ts
import { assertNever } from '@/infra/ddd/utils.js';

// В switch/case для exhaustive check
default:
  assertNever(event);
```

---

## Clock (`@/infra/lib/clock.js`)

Абстракция времени для тестируемости. Инъектируется через DI.

```ts
abstract class Clock {
  public abstract now(): Date;
}

class SystemClock extends Clock {
  public now(): Date { return new Date(); }
}
```

Регистрация: `{ provide: Clock, useClass: SystemClock }`

---

## Database (`@/infra/lib/nest-drizzle/`)

Настраиваемый NestJS-модуль для работы с Drizzle ORM.

### DatabaseClient

Каждая feature получает свой клиент:

```ts
export const IdpDatabaseClient = CreateDatabaseClient('IdpDatabaseClient');
export const MediaDatabaseClient = CreateDatabaseClient('MediaDatabaseClient');
export const DiscoveryDatabaseClient = CreateDatabaseClient('DiscoveryDatabaseClient');
```

### Регистрация

```ts
DatabaseModule.register({
  connection: config.get('DATABASE_URL'),
  isGlobal: true,
  clients: [IdpDatabaseClient, MediaDatabaseClient, DiscoveryDatabaseClient],
})
```

### TransactionHost (`@/infra/db/tx-host-pg.ts`)

PostgreSQL-реализация абстрактного `TransactionHost` из kernel.

```ts
@Injectable()
export class TransactionHostPg extends TransactionHost {
  private readonly transactions = new WeakMap<Transaction, DrizzleTx>();

  public async startTransaction<T>(cb: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.connectionPool.db.transaction(async (tx) => {
      const transaction = createTransaction();
      this.transactions.set(transaction, tx);
      return cb(transaction);
    });
  }

  public get(transaction: Transaction): DrizzleTx {
    if (transaction.type === 'no-transaction') return this.connectionPool.db;
    const tx = this.transactions.get(transaction);
    if (!tx) throw new Error('transaction not existed');
    return tx;
  }
}
```

---

## Authorization (`@/infra/lib/authorization/`)

RBAC-система на основе TypeBox-схем.

### Permission Schema

```ts
// Виды пермишенов
BooleanPerm('ROLE.MANAGE', false)              // true/false
EnumPerm('SESSION.MANAGE', ['self', 'all'], 'self')  // множество значений
SchemaPerm('CUSTOM', schema, defaultValue)     // произвольная TypeBox-схема
```

### PermissionService

Проверяет пермишены на основе роли текущего пользователя. Роли загружаются из БД и кэшируются в `PermissionsStore`.

### Контекст сессии (SessionContext)

Хранит данные текущего пользователя в AsyncLocalStorage. Используется `PermissionCheckService` для определения роли.

---

## Kafka (`@/infra/lib/nest-kafka/`)

### Контракты

```ts
// TypeBox-контракт
export const userEventsContract = createTypeboxContract({
  topic: 'user.events',
  schema: UserEventSchema,
});

// Protobuf-контракт (альтернатива)
export const contract = createProtobufContract({
  topic: 'service.events',
  schema: ServiceEventProto,
});
```

### Producer

```ts
await this.kafkaProducer.send(userEventsContract, message, { key: userId });
```

### Consumer

```ts
@KafkaHandler(userEventsContract)
async handleUserEvent(message: UserEventMessage) {
  // ...
}
```

---

## Outbox (`@/infra/lib/nest-outbox/`)

Гарантированная доставка событий. Запись в outbox-таблицу в той же транзакции, что и бизнес-операция.

```ts
// Внутри транзакции:
await this.outbox.enqueue(drizzleTx, userEventsContract, message, { key: userId });
```

Outbox Relay — фоновый процесс, который вычитывает из outbox-таблицы и отправляет в Kafka.

---

## Search (`@/infra/lib/nest-search/`)

Интеграция с Meilisearch.

```ts
const adminUsersIndexDefinition: IndexDefinition = {
  name: 'admin_users',
  primaryKey: 'userId',
  searchableAttributes: ['fullName', 'phoneNumber'],
  filterableAttributes: ['role', 'createdAt'],
  sortableAttributes: ['createdAt'],
};

export const AdminUsersSearchClient = CreateSearchClient([adminUsersIndexDefinition]);

SearchModule.registerAsync({
  clients: [AdminUsersSearchClient],
  useFactory: (config) => ({
    host: config.get('MEILI_URL'),
    apiKey: config.get('MEILI_API_KEY'),
  }),
})
```

---

## Auth (`@/infra/auth/`)

### JwtAuthGuard

Валидирует JWT, проверяет существование сессии, сохраняет `JwtUserPayload` в request и AsyncLocalStorage.

```ts
@UseGuards(JwtAuthGuard)
```

### CurrentUser decorator

```ts
@CurrentUser() user: JwtUserPayload
// { userId: UserId, role: Role, sessionId: SessionId }
```

### Обработка ошибок (Domain → HTTP)

Цепочка: **DomainError → `.toResponse()` → `domainToHttpError()` → HttpException**.

#### 1. Определение доменной ошибки

```ts
// domain/errors.ts
import { CreateDomainError } from '@/infra/ddd/error.js';

// Без данных — второй аргумент задаёт HTTP-код
class InvalidOtpError extends CreateDomainError('invalid_otp', 400) {}

// С данными
class OtpThrottleError extends CreateDomainError('throttled', 429).withData<{
  retryAfterSec: number;
}>() {}

new OtpThrottleError({ retryAfterSec: 30 });
```

`DomainError` хранит `type` (строковый код), `httpCode` и опциональные `data`. Метод `.toResponse()` формирует объект `{ [httpCode]: { type, message?, data } }`.

#### 2. Преобразование в HTTP-ошибку

```ts
// @/infra/contracts/api-error.ts
import { domainToHttpError } from '@/infra/contracts/api-error.js';

// domainToHttpError принимает результат .toResponse() и создаёт HttpException
// Типизирован по операции OpenAPI — подсказывает допустимые коды/тела ответа
throw domainToHttpError<'requestOtp'>(result.error.toResponse());
```

#### 3. Паттерн использования в контроллере

```ts
@Post('request-otp')
@HttpCode(200)
public async requestOtp(
  @Body() body: PublicBody['requestOtp'],
): Promise<PublicResponse['requestOtp']> {
  const result = await this.createOtp.execute({ phoneNumber: body.phoneNumber, ip });

  if (isLeft(result)) {
    throw domainToHttpError<'requestOtp'>(result.error.toResponse());
  }

  return {};
}
```

#### 4. Ad-hoc HTTP-ошибки (без доменной ошибки)

Когда ошибка возникает на уровне контроллера (валидация заголовков и т.п.):

```ts
if (!refreshToken) {
  throw domainToHttpError<'refresh'>({ 401: { type: 'missing_refresh_token' } });
}
```

#### Правила

- **HTTP-код задаётся в доменной ошибке** (`CreateDomainError('type', 400)`) — контроллер не решает, какой код вернуть
- **Контроллер не ловит исключения** — `domainToHttpError` выбрасывает `HttpException`, NestJS сам формирует ответ
- **`isLeft` → throw** — единственный паттерн обработки ошибок в контроллерах
- **Типизация по OpenAPI** — дженерик `domainToHttpError<'operationId'>` проверяет, что тело ответа соответствует схеме

---

## Contracts (`@/infra/contracts/`)

API-контракты описываются в отдельном пакете `../http-contracts/` в виде OpenAPI 3.1 YAML-файлов:

```
http-contracts/
├── main.yaml              ← корневой файл, собирает все endpoints
├── endpoints/
│   ├── idp/               ← auth, profile, roles, sessions
│   ├── media/             ← upload, files
│   └── banners/           ← баннеры
└── shared/                ← переиспользуемые схемы
```

### Генерация типов

Команды из `package.json`:

```bash
yarn openapi-bundle   # собирает YAML → generated-public-schema.json (через @redocly/cli)
yarn openapi-gen      # генерирует TypeScript-типы → generated-public-schema.d.ts (через openapi-typescript)
yarn openapi          # обе команды последовательно
```

### Использование в коде

```ts
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';

@Post('request-otp')
public async requestOtp(
  @Body() body: PublicBody['requestOtp'],
): Promise<PublicResponse['requestOtp']> { /* ... */ }
```

---

## Тестирование (E2E)

- **Testcontainers** — PostgreSQL, S3 (MinIO), Kafka (Redpanda)
- **Redpanda** вместо Kafka — старт за 3-5 сек vs 30-60 сек
- Хелперы: `src/test/e2e/helpers/`

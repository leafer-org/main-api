# E2E Testing

## Обзор

E2E тесты проверяют работу всего приложения целиком — от HTTP-запроса до базы данных, Kafka и поисковых индексов. Тесты запускаются в изолированном окружении с реальными сервисами через **testcontainers**.

**Стек:** Vitest + Supertest + Testcontainers (PostgreSQL, Redpanda, MinIO, MeiliSearch).

## Структура файлов

```
src/test/e2e/
├── helpers/              # Технические хелперы (инфраструктура)
│   ├── containers.ts     # Запуск/остановка контейнеров
│   ├── create-app.ts     # Bootstrap NestJS-приложения
│   ├── db.ts             # Миграции, truncate, сиды
│   ├── kafka.ts          # Создание топиков из YAML, ожидание consumer'ов
│   ├── outbox.ts         # Flush outbox + producer
│   └── s3.ts             # Создание S3-бакетов
├── actors/               # Бизнес-хелперы (действия пользователей)
│   └── auth.ts           # loginAsAdmin, registerUser
└── *.e2e-spec.ts         # Тестовые файлы
```

## Конфигурация Vitest

Файл: `vitest.config.e2e.ts`

```ts
export default defineConfig({
  test: {
    include: ['src/test/e2e/**/*.e2e-spec.ts'],
    testTimeout: 30_000,      // 30с на тест
    hookTimeout: 120_000,     // 120с на beforeAll/afterAll (контейнеры)
    pool: 'forks',            // изоляция через процессы
    maxWorkers: 1,            // последовательное выполнение
  },
});
```

- **`pool: 'forks'`** — каждый тестовый файл запускается в отдельном процессе
- **`maxWorkers: 1`** — тесты не запускаются параллельно, чтобы не было конфликтов за контейнеры

## Контейнеры

Все контейнеры запускаются **параллельно** в `beforeAll`:

| Контейнер | Образ | Назначение |
|-----------|-------|------------|
| PostgreSQL | `postgres:18-alpine` | Основная БД |
| Redpanda | `redpandadata/redpanda:latest` | Kafka-совместимый брокер (старт за 3-5с) |
| MinIO | `minio/minio:latest` | S3-совместимое хранилище |
| MeiliSearch | `getmeili/meilisearch:latest` | Полнотекстовый поиск |

> Redpanda используется вместо Apache Kafka — полностью совместим по протоколу, но стартует за 3-5 секунд вместо 30-60.

```ts
import { startContainers, stopContainers } from './helpers/containers.js';

beforeAll(async () => {
  await startContainers();
  // startContainers() — идемпотентна, повторный вызов не перезапускает контейнеры
});

afterAll(async () => {
  await stopContainers();
});
```

`startContainers()` автоматически:
1. Запускает все контейнеры параллельно
2. Создаёт Kafka-топики из YAML-файлов в `topicctl/topics/`
3. Устанавливает `process.env` переменные (`DB_URL`, `KAFKA_BROKER`, `MEILI_URL` и т.д.)

## Жизненный цикл теста

```
beforeAll (1 раз на describe)
├── startContainers()          — запуск PostgreSQL, Redpanda, MinIO, MeiliSearch
├── runMigrations()            — применение Drizzle-миграций
├── createBuckets()            — создание S3-бакетов
├── createTestingModule()      — сборка NestJS-приложения
├── app.init()                 — инициализация модулей
└── waitForPartitions()        — ожидание готовности Kafka consumer

beforeEach (перед каждым тестом)
├── seedStaticRoles()          — сид ролей ADMIN, USER
├── seedAdminUser()            — сид админ-пользователя
└── PermissionsStore.refresh() — обновление кеша прав

it(...)                        — тест

afterEach (после каждого теста)
└── truncateAll()              — очистка всех таблиц (кроме миграций)

afterAll (1 раз)
├── app.close()                — остановка NestJS
└── stopContainers()           — остановка контейнеров
```

## Bootstrap приложения

### Базовый вариант

```ts
import { createApp, type E2eApp } from './helpers/create-app.js';

let e2e: E2eApp;

beforeAll(async () => {
  await startContainers();
  await runMigrations(process.env.DB_URL!);
  e2e = await createApp();
});
```

### С переопределением провайдеров

Когда нужно мокнуть сервисы (например, OTP-генератор), bootstrap делается вручную:

```ts
import { Test } from '@nestjs/testing';
import request from 'supertest';

const FIXED_OTP = '123456';

beforeAll(async () => {
  await startContainers();
  await runMigrations(process.env.DB_URL!);
  await createBuckets();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(OtpGeneratorService)
    .useValue({ generate: () => OtpCode.raw(FIXED_OTP) })
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  e2e = { app, agent: request(app.getHttpServer()) };
});
```

## Ожидание готовности Kafka consumer

После `app.init()` Kafka consumer подключен к брокеру, но **ещё не получил partition assignment**. Сообщения, отправленные до assignment, будут пропущены (rdkafka по умолчанию стартует с `auto.offset.reset=largest`).

### Один consumer (один модуль)

```ts
import { KafkaConsumerService } from '@/infra/lib/nest-kafka/consumer/kafka-consumer.service.js';

await app.init();
await app.get(KafkaConsumerService).waitForPartitions();
```

### Несколько consumer'ов (несколько модулей)

Когда в приложении несколько модулей с собственными `KafkaConsumerService` (например, `DiscoveryModule` + другой модуль), `app.get(KafkaConsumerService)` вернёт только один из них. Для ожидания **всех** consumer'ов используется хелпер `waitForAllConsumers`:

```ts
import { waitForAllConsumers } from './helpers/kafka.js';

await app.init();
await waitForAllConsumers(app);
```

`waitForAllConsumers()` обходит внутренний DI-контейнер NestJS, находит все экземпляры `KafkaConsumerService` во всех модулях и вызывает `waitForPartitions()` у каждого.

`waitForPartitions()` ждёт первого `rebalance` callback с `ERR__ASSIGN_PARTITIONS`. Без этого вызова тесты, зависящие от Kafka-проекций, будут нестабильны.

## Работа с Outbox

Доменные события не отправляются напрямую в Kafka. Они записываются в таблицу `outbox` в той же транзакции, что и изменения в БД. `OutboxRelayService` периодически читает outbox и публикует события в Kafka.

В тестах нужно **явно вызвать flush**, чтобы события дошли до Kafka:

```ts
import { flushOutbox } from './helpers/outbox.js';

// Выполнить действие, которое порождает событие
await agent.post('/auth/complete-profile').send({ ... }).expect(200);

// Гарантировать, что событие отправлено в Kafka
await flushOutbox(e2e.app);
```

`flushOutbox()` выполняет:
1. `OutboxRelayService.flush()` — считывает outbox и отправляет в producer
2. `KafkaProducerService.flush()` — ждёт подтверждения доставки от брокера

## Ожидание асинхронных проекций (vi.waitFor)

Kafka consumer обрабатывает сообщения асинхронно. Для проверки результатов проекций используется встроенный `vi.waitFor` из Vitest — он повторяет callback до тех пор, пока тот не перестанет бросать ошибку:

```ts
import { vi } from 'vitest';

await flushOutbox(e2e.app);

await vi.waitFor(
  async () => {
    const res = await e2e.agent
      .get('/admin/users')
      .query({ query: 'Searchable' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.total).toBeGreaterThan(0);
  },
  { timeout: 10_000, interval: 500 },
);
```

**Полный pipeline:** действие → outbox → flush → Kafka → consumer → MeiliSearch → vi.waitFor → assert.

## Аутентификация в тестах

OTP-генератор мокается фиксированным значением. Общие auth-хелперы вынесены в `src/test/e2e/actors/auth.ts`:

```ts
import { loginAsAdmin, registerUser } from './actors/auth.js';

const FIXED_OTP = '123456';

// Логин существующего админа (сиженного через seedAdminUser)
const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

// Регистрация нового пользователя
const { accessToken, userId } = await registerUser(e2e.agent, FIXED_OTP, {
  phone: '+79990000003',
  fullName: 'Custom Name',
});

// Регистрация с дефолтами (phone: +79990000002, fullName: 'Test User')
const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
```

## База данных

### Миграции

```ts
import { runMigrations } from './helpers/db.js';

// Вызвать 1 раз в beforeAll
await runMigrations(process.env.DB_URL!);
```

### Очистка между тестами

```ts
import { truncateAll } from './helpers/db.js';

afterEach(async () => {
  await truncateAll(process.env.DB_URL!);
});
```

`truncateAll()` — `TRUNCATE ... CASCADE` для всех таблиц кроме `__drizzle_migrations`.

> Важно: `truncateAll` очищает только PostgreSQL. MeiliSearch индексы **не очищаются** между тестами. Если нужна изоляция поиска — используйте уникальные имена в каждом тесте.

### Сиды

```ts
import { seedStaticRoles, seedAdminUser, ADMIN_PHONE } from './helpers/db.js';

beforeEach(async () => {
  await seedStaticRoles(process.env.DB_URL!); // роли ADMIN, USER
  await seedAdminUser(process.env.DB_URL!);    // пользователь с телефоном ADMIN_PHONE
  await e2e.app.get(PermissionsStore).refresh(); // обновить кеш прав
});
```

`PermissionsStore.refresh()` обязателен — роли кешируются в памяти, после `truncateAll` + `seed` кеш нужно обновить.

## S3-бакеты

```ts
import { createBuckets } from './helpers/s3.js';

beforeAll(async () => {
  await startContainers();
  await createBuckets(); // создаёт media-public, media-public-temp
});
```

Идемпотентно — игнорирует ошибку, если бакет уже существует.

## Полный пример теста

```ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loginAsAdmin, registerUser } from './actors/auth.js';
import { startContainers, stopContainers } from './helpers/containers.js';
import { type E2eApp } from './helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from './helpers/db.js';
import { flushOutbox } from './helpers/outbox.js';
import { createBuckets } from './helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { KafkaConsumerService } from '@/infra/lib/nest-kafka/consumer/kafka-consumer.service.js';
import { PermissionsStore } from '@/infra/auth/authz/permissions-store.js';

const FIXED_OTP = '123456';

describe('Feature Name (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    await startContainers();
    await runMigrations(process.env.DB_URL!);
    await createBuckets();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpGeneratorService)
      .useValue({ generate: () => OtpCode.raw(FIXED_OTP) })
      .compile();

    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.get(KafkaConsumerService).waitForPartitions();

    e2e = { app, agent: request(app.getHttpServer()) };
  });

  beforeEach(async () => {
    await seedStaticRoles(process.env.DB_URL!);
    await seedAdminUser(process.env.DB_URL!);
    await e2e.app.get(PermissionsStore).refresh();
  });

  afterEach(async () => {
    await truncateAll(process.env.DB_URL!);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  it('should do something', async () => {
    // 1. Аутентификация
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    // 2. Действие (HTTP-запрос)
    // 3. flushOutbox() — если есть Kafka-проекции
    // 4. vi.waitFor() — если нужно дождаться async-обработки
    // 5. Ассерты
  });
});
```

## Чеклист при написании нового e2e теста

1. Файл называется `*.e2e-spec.ts` и лежит в `src/test/e2e/`
2. `beforeAll`: контейнеры → миграции → бакеты → app.init → waitForPartitions
3. `beforeEach`: сиды + refresh кеша прав
4. `afterEach`: truncateAll
5. `afterAll`: app.close → stopContainers
6. После действий, порождающих outbox-события: `await flushOutbox(e2e.app)`
7. Для async-проекций: `vi.waitFor()` с polling
8. Уникальные телефоны для каждого теста (избежать конфликтов `ON CONFLICT`)
9. Не забыть мокнуть `OtpGeneratorService`, если тесты используют аутентификацию

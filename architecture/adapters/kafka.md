# Kafka

## Структура

```
adapters/kafka/
├── consumer-ids.ts                  ← идентификаторы consumer group
├── topics.ts                        ← контракты сообщений (TypeBox)
├── *-projection.handler.ts          ← обработчики входящих событий
└── *-event-publisher.ts             ← Outbox-публикация исходящих событий
```

## Consumer ID

```ts
import { createConsumerId } from '@/infra/lib/nest-kafka/index.js';

export const IDP_CONSUMER_ID = createConsumerId('idp-consumer');
```

## Topic Contract

Контракт описывает схему сообщения через TypeBox:

```ts
import { Type } from 'typebox';
import type { ContractMessage } from '@/infra/lib/nest-kafka/contract/contract.js';
import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

const UserSnapshotMessage = Type.Object({
  userId: Type.String(),
  phoneNumber: Type.String(),
  fullName: Type.String(),
  role: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const userStreamingContract = createTypeboxContract({
  topic: 'user.streaming',
  schema: UserSnapshotMessage,
});

export type UserStreamingMessage = ContractMessage<typeof userStreamingContract>;
```

## Projection Handler (входящие события)

```ts
@KafkaConsumerHandlers(IDP_CONSUMER_ID)
@Injectable()
export class UserEventsProjectionHandler {
  public constructor(private readonly handler: OnUserEventHandler) {}

  @BatchContractHandler(userStreamingContract)
  public async handleBatch(
    messages: ContractKafkaMessage<typeof userStreamingContract>[],
  ): Promise<void> {
    await this.handler.handleBatch(messages.map((m) => m.value));
  }
}
```

## Event Publisher (Outbox)

Публикация событий через Outbox pattern — в той же транзакции, что и бизнес-операция.

```ts
@Injectable()
export class OutboxUserEventPublisher implements UserEventPublisher {
  public constructor(
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(TransactionHostPg) private readonly txHost: TransactionHostPg,
  ) {}

  public async publish(tx: Transaction, userId: UserId, event: UserEvent): Promise<void> {
    const drizzleTx = this.txHost.get(tx);
    const message = this.toMessage(userId, event);
    await this.outbox.enqueue(drizzleTx, userEventsContract, message, { key: userId });
  }
}
```

## Outbox Infrastructure

Расположение: `src/infra/lib/nest-outbox/`

### Таблица outbox

```ts
// outbox.schema.ts
export const outboxTable = pgTable('outbox', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  topic: text('topic').notNull(),
  key: text('key'),
  payload: customType<{ data: Buffer }>({
    dataType: () => 'bytea',
  })('payload'),
  headers: jsonb('headers').$type<Record<string, string>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### OutboxService

Записывает сообщения в outbox-таблицу внутри транзакции:

- `enqueue(tx, contract, message, options?)` — одно сообщение
- `enqueueBatch(tx, contract, messages)` — batch

Сериализует payload через `contract.serializer` и сохраняет как `bytea`.

### OutboxRelayService

Поллер, который забирает сообщения из outbox и отправляет в Kafka:

1. Запускается при старте модуля (`OnModuleInit`), интервал — 1000ms
2. `poll()` — в транзакции:
   - `SELECT ... FOR UPDATE SKIP LOCKED` (до 100 строк за раз)
   - Отправляет каждое сообщение через `producer.sendRaw()`
   - Удаляет обработанные строки из таблицы
3. `flush()` — ожидает завершения текущего poll + делает финальный poll + flush producer

### Регистрация в app.module

```ts
OutboxModule.register({ isGlobal: true }),
KafkaProducerModule.registerAsync({ /* ... */ }),
OutboxRelayModule,
```

### Тестирование

```ts
import { flushOutbox } from '@/test/e2e/helpers/outbox.js';

// В e2e-тестах после бизнес-операции:
await flushOutbox(app); // poll + flush producer
```

## Правила

- Один consumer ID на фичу
- Контракт = TypeBox-схема + topic name
- Projection handler делегирует обработку use case / event handler из `application/`
- Publisher использует `OutboxService.enqueue()` внутри транзакции
- `key` — партиционирование по ID агрегата
- Outbox гарантирует at-least-once delivery: данные и сообщение в одной транзакции

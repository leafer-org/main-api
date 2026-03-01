# @powerthread/nest-outbox

Паттерн transactional outbox для NestJS с Drizzle ORM. Вместо прямой отправки событий в Kafka, события записываются в таблицу `outbox` в рамках той же транзакции, что и бизнес-данные. Debezium CDC читает WAL PostgreSQL и публикует строки в Kafka, гарантируя атомарность.

## Установка

```bash
yarn add @powerthread/nest-outbox
```

Peer-зависимости: `@nestjs/common`, `drizzle-orm`, `@powerthread/nest-kafka`.

## Использование

### 1. Регистрация модуля

```typescript
import { OutboxModule } from '@powerthread/nest-outbox';

@Module({
  imports: [OutboxModule.register({ isGlobal: true })],
})
export class AppModule {}
```

### 2. Миграция для создания таблицы outbox

```sql
CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  key TEXT,
  payload BYTEA,
  headers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3. Отправка сообщений через OutboxService

```typescript
import { OutboxService } from '@powerthread/nest-outbox';

@Injectable()
export class OrderService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly db: NodePgDatabase,
  ) {}

  async createOrder(order: Order) {
    await this.db.transaction(async (tx) => {
      await tx.insert(orders).values(order);
      await this.outboxService.enqueue(tx, orderCreatedContract, orderPayload, {
        key: order.id,
      });
    });
  }
}
```

## Настройка Debezium Connector

```jsonc
{
  "name": "outbox-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    // Настройка подключения к postgresql
    "database.hostname": "localhost",
    "database.port": "5432",
    "database.user": "postgres",
    "database.password": "postgres",
    "database.dbname": "mydb",
    // Основные настройки
    "topic.prefix": "outbox",
    "table.include.list": "public.outbox",
    "tombstones.on.delete": "false",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.field.event.id": "id",
    "transforms.outbox.table.field.event.key": "key",
    "transforms.outbox.table.field.event.payload": "payload",
    "transforms.outbox.route.by.field": "topic",
    "transforms.outbox.route.topic.replacement": "${routedByValue}",
    "transforms.outbox.table.fields.additional.placement": "headers:header",
    "value.converter": "io.debezium.converters.BinaryDataConverter",
    // Автоматическое содание топиков при первой обработке (опционально)
    "topic.creation.default.replication.factor": 1,
    "topic.creation.default.partitions": 1,
    "topic.creation.enable": "true",

    // Heartbeat для проверки что живой
    "heartbeat.interval.ms": "10000",
    "heartbeat.action.query": "INSERT INTO public.dbz_heartbeat (id, ts) VALUES (1, NOW()) ON CONFLICT(id) DO UPDATE SET ts=EXCLUDED.ts;",

  }
}
```

Ключевые моменты:
- **EventRouter** SMT маршрутизирует по колонке `topic` в соответствующий Kafka-топик
- Колонка **key** становится ключом Kafka-сообщения (для партиционирования)
- **payload** (bytea) передается как сырые байты в значение Kafka-сообщения
- **headers** (jsonb) становятся заголовками Kafka-сообщения
- **BinaryDataConverter** гарантирует передачу payload без дополнительной сериализации
- Kafka message timestamp устанавливается Debezium автоматически; время бизнес-события рекомендуется передавать в payload контракта

## Очистка таблицы outbox

Debezium читает WAL PostgreSQL и не удаляет обработанные записи из таблицы. Без очистки таблица будет расти бесконечно. Рекомендуется настроить периодическое удаление старых записей через `pg_cron`:

```sql
-- Включить расширение (один раз)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Удалять записи старше 7 дней каждый час
SELECT cron.schedule(
  'outbox-cleanup',
  '0 * * * *',
  $$DELETE FROM public.outbox WHERE created_at < now() - interval '7 days'$$
);
```

Или через crontab на хосте:

```bash
0 * * * * psql -U postgres -d mydb -c "DELETE FROM outbox WHERE created_at < now() - interval '7 days'"
```

## Пример

Полный рабочий пример с docker-compose (PostgreSQL, Kafka, Debezium) находится в `apps/example`.

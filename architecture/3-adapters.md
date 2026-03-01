# Adapters — HTTP, DB, Kafka, Services

Adapters — конкретные реализации портов из application-слоя. Живут в `adapters/` внутри feature.

---

## Структура

```
adapters/
├── db/                   ← Database (Drizzle ORM)
│   ├── schema.ts         ← Drizzle-таблицы
│   ├── client.ts         ← DatabaseClient для feature
│   ├── repositories/     ← Write-side (Transaction)
│   │   ├── user.repository.ts
│   │   └── session.repository.ts
│   └── queries/          ← Read-side (DatabaseClient)
│       ├── me.query.ts
│       └── role.query.ts
├── http/                 ← HTTP-контроллеры
│   ├── auth.controller.ts
│   ├── me.controller.ts
│   └── roles.controller.ts
├── kafka/                ← Event publishing
│   ├── topics.ts         ← контракты сообщений
│   └── user-events.handler.ts
├── id/                   ← ID-генераторы
│   └── id-generator.service.ts
├── jwt/                  ← JWT-сервисы
│   ├── jwt-access.service.ts
│   └── refresh-token.service.ts
├── otp/                  ← OTP-сервисы
└── s3/                   ← Файловое хранилище
```

---

## DB: Repository Adapter (write-side)

Реализует порт из `application/ports.ts`. Работает с `Transaction` через `TransactionHostPg`.

```ts
@Injectable()
export class DrizzleUserRepository extends UserRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, userId: UserId): Promise<UserState | null> {
    const db = this.txHost.get(tx);               // ← получаем Drizzle-клиент из транзакции
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);                     // ← конвертация DB → domain state
  }

  public async save(tx: Transaction, state: UserState): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(users)
      .values({
        id: state.id,
        phoneNumber: state.phoneNumber as string,  // ← branded → primitive
        fullName: state.fullName as string,
        role: state.role as string,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { /* ... */ },
      });
  }

  private toDomain(row: typeof users.$inferSelect): UserState {
    return {
      id: UserId.raw(row.id),                     // ← primitive → branded
      phoneNumber: PhoneNumber.raw(row.phoneNumber),
      fullName: row.fullName as UserState['fullName'],
      role: Role.raw(row.role),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
```

### Правила repository adapter'а

- Наследуется от абстрактного порта (`extends UserRepository`)
- Вызывает `super()` в конструкторе
- Инъектирует `TransactionHostPg` (конкретная реализация, не абстрактный `TransactionHost`)
- Все методы принимают `Transaction` первым параметром
- `toDomain()` — приватный метод для конвертации DB-строки в domain state
- Персистенция через `upsert` (`onConflictDoUpdate`) для идемпотентности

---

## DB: Query Adapter (read-side)

Работает напрямую с пулом соединений через `DatabaseClient`, без транзакций.

```ts
@Injectable()
export class DrizzleMeQuery extends MeQueryPort {
  public constructor(private readonly dbClient: IdpDatabaseClient) {
    super();
  }

  public async findMe(userId: UserId, sessionId: SessionId): Promise<MeReadModel | null> {
    const rows = await this.dbClient.db
      .select({
        userId: users.id,
        role: users.role,
        sessionId: sessions.id,
        fullName: users.fullName,
        phoneNumber: users.phoneNumber,
        /* ... */
      })
      .from(users)
      .innerJoin(sessions, and(eq(sessions.userId, users.id), eq(sessions.id, sessionId)))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return { /* ... read model ... */ };
  }
}
```

### Отличия от repository adapter'а

| | Repository (write) | Query (read) |
|---|---|---|
| **Инъектирует** | `TransactionHostPg` | `DatabaseClient` |
| **Принимает `Transaction`** | Да | Нет |
| **Возвращает** | Domain State | Read Model |
| **JOIN'ы** | Редко | Часто (денормализация) |

---

## HTTP: Controller

Тонкий слой между HTTP и application. Инъектирует interactor'ы (не порты напрямую).

```ts
@Controller('auth')
export class AuthController {
  public constructor(
    private readonly createOtp: CreateOtpInteractor,
    private readonly verifyOtp: VerifyOtpInteractor,
  ) {}

  @Post('request-otp')
  @HttpCode(200)
  public async requestOtp(
    @Body() body: PublicBody['requestOtp'],
    @Req() req: Request,
  ): Promise<PublicResponse['requestOtp']> {
    const result = await this.createOtp.execute({
      phoneNumber: body.phoneNumber,
      ip: req.ip ?? '',
    });

    if (isLeft(result)) {
      const error = result.error;
      if (error instanceof OtpThrottleError) {
        throw apiError('requestOtp', { code: error.type, retryAfterSec: error.data.retryAfterSec }, 429);
      }
      throw new HttpException({ code: error.type }, 400);
    }

    return {};
  }
}
```

### Правила контроллера

- Инъектирует interactor'ы и query interactor'ы
- Маппит `Either.Left` → HTTP-ошибки через `apiError()` / `HttpException`
- Маппит `Either.Right` → HTTP-ответ
- Использует типы из `@/infra/contracts/types.js` (`PublicBody`, `PublicResponse`)
- Аутентификация: `@UseGuards(JwtAuthGuard)`
- Текущий пользователь: `@CurrentUser()` декоратор

---

## Kafka: Event Publisher (Outbox)

Публикация событий через Outbox pattern — в той же транзакции, что и бизнес-операция.

### Контракт (topics.ts)

```ts
const UserCreatedMessage = Type.Object({
  type: Type.Literal('user.created'),
  userId: Type.String(),
  phoneNumber: Type.String(),
  fullName: Type.String(),
  role: Type.String(),
  createdAt: Type.String(),
});

export const userEventsContract = createTypeboxContract({
  topic: 'user.events',
  schema: Type.Union([UserCreatedMessage, UserProfileUpdatedMessage, UserRoleUpdatedMessage]),
});

export type UserEventMessage = ContractMessage<typeof userEventsContract>;
```

### Publisher

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

  private toMessage(userId: UserId, event: UserEvent): UserEventMessage {
    switch (event.type) {
      case 'user.created':
        return { type: 'user.created', userId: event.id as string, /* ... */ };
      // ...
      default:
        assertNever(event);
    }
  }
}
```

### Правила event publisher'а

- Реализует порт (`implements UserEventPublisher`)
- Конвертирует domain event → message (сериализуемый формат)
- Использует `outbox.enqueue()` — запись в outbox-таблицу внутри транзакции
- `key` — партиционирование по ID агрегата

---

## Регистрация в Module

Все адаптеры регистрируются в feature module через `{ provide: Port, useClass: Adapter }`:

```ts
@Global()
@Module({
  controllers: [AuthController, MeController, RolesController],
  providers: [
    // Adapters: Port → Adapter
    { provide: LoginProcessRepository, useClass: DrizzleLoginProcessRepository },
    { provide: UserRepository, useClass: DrizzleUserRepository },
    { provide: SessionRepository, useClass: DrizzleSessionRepository },
    { provide: MeQueryPort, useClass: DrizzleMeQuery },
    { provide: JwtAccessService, useClass: NestJwtAccessService },
    { provide: OtpGeneratorService, useClass: CryptoOtpGenerator },
    { provide: IdGenerator, useClass: UuidIdGenerator },
    { provide: Clock, useClass: SystemClock },
    { provide: UserEventPublisher, useClass: OutboxUserEventPublisher },
    // Use cases (simple providers)
    CreateOtpInteractor,
    VerifyOtpInteractor,
    RegisterInteractor,
    // Queries
    GetMeInteractor,
    GetUserSessionsInteractor,
  ],
  exports: [SessionValidationPort],
})
export class IdpModule {}
```

---

## Чек-лист нового адаптера

1. [ ] `@Injectable()` декоратор
2. [ ] Наследуется от или реализует абстрактный порт
3. [ ] Зарегистрирован в module: `{ provide: Port, useClass: Adapter }`
4. [ ] Repository: инъектирует `TransactionHostPg`, использует `txHost.get(tx)`
5. [ ] Query: инъектирует `DatabaseClient`, работает без транзакций
6. [ ] Controller: маппит `Either` → HTTP responses
7. [ ] Kafka publisher: использует `OutboxService.enqueue()` в транзакции

# Application — Use Cases, Handlers, Ports

Application-слой оркестрирует I/O и вызывает чистый домен. Содержит interactor'ы, handler'ы и определения портов.

---

## Структура

```
application/
├── ports.ts                              ← все порты feature
└── use-cases/                            ← write + read + event handlers
    ├── otp-flow/
    │   ├── create-otp.interactor.ts      ← write interactor
    │   ├── verify-otp.interactor.ts
    │   └── register.interactor.ts
    ├── me/
    │   └── get-me.interactor.ts          ← query interactor
    ├── user-sessions/
    │   └── get-user-sessions.interactor.ts
    └── admin-users-list/
        ├── search-admin-users.interactor.ts  ← query interactor
        └── on-user-event.handler.ts          ← event handler рядом с use case
```

---

## Use Case и Interactor

**Use Case** — бизнес-сценарий целиком (например, "вход по OTP"). Может состоять из нескольких последовательных взаимодействий пользователя с системой.

**Interactor** — обработчик одного шага взаимодействия внутри use case. Один request-response цикл.

```
application/use-cases/<use-case-name>/
├── create-otp.interactor.ts      ← шаг 1
├── verify-otp.interactor.ts      ← шаг 2
└── register.interactor.ts        ← шаг 3
```

---

## Write Interactor

Ответственности:
1. **Проверка прав доступа** (`permissionCheck.mustCan`)
2. Парсинг входных данных → Value Objects
3. Загрузка состояния из репозитория
4. Вызов `decide` (чистая доменная функция)
5. Вызов `apply` для нового состояния
6. Персистенция и побочные эффекты

```ts
@Injectable()
export class CreateOtpInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
    private readonly loginProcessRepository: LoginProcessRepository,
    private readonly otpGenerator: OtpGeneratorService,
    private readonly idGenerator: IdGenerator,
    private readonly sender: OtpSenderService,
  ) {}

  public async execute(command: { ip: string; phoneNumber: string }) {
    // 1. Парсинг → Value Objects
    const parsedEither = this.parseCommand(command);
    if (isLeft(parsedEither)) return parsedEither;

    const { fingerPrint, phoneNumber } = parsedEither.value;
    const now = this.clock.now();

    // 2-5. Транзакция: загрузка → decide → apply → persist
    return this.txHost.startTransaction(async (tx) => {
      const latestState = await this.loginProcessRepository.findLatestBy(tx, phoneNumber, fingerPrint);

      const eventEither = sendOtpCommandDecide(latestState, {
        type: 'CreateOtp',
        newLoginProcessId: this.idGenerator.generateLoginProcessId(),
        fingerPrint,
        now,
        otpCode: this.otpGenerator.generate(),
        phoneNumber,
      });
      if (isLeft(eventEither)) return eventEither;

      const newState = loginProcessApply(latestState, eventEither.value);
      await this.loginProcessRepository.save(tx, newState);
      await this.sender.send({ phoneNumber, code: eventEither.value.otpCode });

      return Right('ok');
    });
  }
}
```

### Правила write interactor'а

- **Не содержит** бизнес-логики — делегирует в `decide`
- Оборачивает операции в `txHost.startTransaction`
- Прокидывает ошибки через `Either` (`isLeft` на каждом шаге)
- Инъектирует зависимости в команду (`now`, `generateId`, `otpCode`)
- Возвращает `Either<DomainError, Result>`

### Синхронный flow с Policy

Когда одно событие порождает команду для другого агрегата через policy:

```ts
// Внутри транзакции interactor'а:
const eventEither = verifyOtpDecide(state, command);
if (isLeft(eventEither)) return eventEither;

const event = eventEither.value;
const newState = loginProcessApply(state, event);
await this.loginProcessRepository.save(tx, newState);

// Policy → команда для другого агрегата
const createSessionCmd = whenLoginCompletedCreateSession(event, { sessionId, now, ttlMs });
const sessionEventEither = sessionDecide(null, createSessionCmd);
// ... apply → save
```

- Эталон: `src/features/idp/application/use-cases/otp-flow/create-otp.interactor.ts`

---

## Проверка прав доступа (Permissions)

Авторизация — часть бизнес-логики и проверяется на уровне **interactor'а** через порт `PermissionCheckService` из `@/kernel/application/ports/permission.js`.

### Порт

```ts
// @/kernel/application/ports/permission.ts
export abstract class PermissionCheckService {
  public abstract can<T extends PermissionVariant>(perm: T, ...args: WhereArg<InferPermissionValue<T>>): boolean;
  public abstract mustCan<T extends PermissionVariant>(perm: T, ...args: WhereArg<InferPermissionValue<T>>): Either<PermissionDeniedError, void>;
}
```

### Использование в interactor'е

```ts
@Injectable()
export class DeleteSessionInteractor {
  public constructor(
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
    private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { sessionId: SessionId }) {
    // Проверка прав — первый шаг
    const authEither = this.permissionCheck.mustCan(Permissions.manageSession);
    if (isLeft(authEither)) return authEither;

    return this.txHost.startTransaction(async (tx) => {
      // ... бизнес-логика
    });
  }
}
```

### Boolean-пермишен

```ts
const authEither = this.permissionCheck.mustCan(Permissions.manageRole);
if (isLeft(authEither)) return authEither;
```

### Enum-пермишен (уровни доступа)

```ts
const authEither = this.permissionCheck.mustCan(
  Permissions.manageSession,
  (level) => level === 'all',
);
if (isLeft(authEither)) return authEither;
```

### Мягкая проверка (ветвление логики)

```ts
if (this.permissionCheck.can(Permissions.manageSession, (level) => level === 'all')) {
  // видим все сессии
} else {
  // видим только свои
}
```

Пермишены определяются в `@/kernel/domain/permissions.ts`.

---

## Query Interactor

Простой запрос к read-model порту. Без транзакций.

```ts
@Injectable()
export class GetMeInteractor {
  public constructor(private readonly meQuery: MeQueryPort) {}

  public async execute(command: { userId: UserId; sessionId: SessionId }) {
    const readModel = await this.meQuery.findMe(command.userId, command.sessionId);
    if (!readModel) return Left(new UserNotFoundError());
    return Right(readModel);
  }
}
```

---

## Handler (реакция на событие)

По структуре идентичен interactor'у, но триггерится событием (Kafka / in-process), а не HTTP-запросом.

```
application/use-cases/otp-flow/
├── create-otp.interactor.ts      ← HTTP-запрос
├── verify-otp.interactor.ts      ← HTTP-запрос
└── on-otp-verified.handler.ts    ← реакция на событие
```

---

## Ports (ports.ts)

Все порты feature определяются в одном файле. Группировка по назначению:

### Aggregate Repository Ports (write-side, transactional)

```ts
export abstract class UserRepository {
  public abstract findById(tx: Transaction, userId: UserId): Promise<UserState | null>;
  public abstract save(tx: Transaction, state: UserState): Promise<void>;
}
```

- Принимают `Transaction` первым параметром
- Работают с domain state напрямую
- Методы: `findById`, `save`, `deleteById`

### Read-Model Query Ports (read-side, без транзакций)

```ts
export abstract class MeQueryPort {
  public abstract findMe(userId: UserId, sessionId: SessionId): Promise<MeReadModel | null>;
}
```

- **Не** принимают `Transaction`
- Возвращают read model типы
- Один порт = один read model

### Service Ports

```ts
export abstract class JwtAccessService {
  public abstract sign(payload: { userId: UserId; role: Role; sessionId: string }): AccessToken;
}

export abstract class OtpGeneratorService {
  public abstract generate(): OtpCode;
}
```

### Event Publishing Ports

```ts
export abstract class UserEventPublisher {
  public abstract publish(tx: Transaction, userId: UserId, event: UserEvent): Promise<void>;
}
```

- Принимают `Transaction` — публикация происходит в той же транзакции (outbox pattern)

### Правила портов

1. Определяются как `abstract class` (не `interface`) — служат DI-токенами
2. Все методы `public abstract`
3. Write-порты принимают `Transaction` первым параметром
4. Read-порты работают без транзакций
5. Value import, не `import type` — для работы NestJS DI

---

## Чек-лист нового interactor'а

1. [ ] `@Injectable()` декоратор
2. [ ] `@Inject(Token)` для всех abstract class зависимостей
3. [ ] Проверка прав через `permissionCheck.mustCan()` в начале `execute()`
4. [ ] `execute()` метод с типизированным input
5. [ ] Возвращает `Either<DomainError, Result>`
6. [ ] Парсинг входных данных в Value Objects
7. [ ] Write: оборачивает в `txHost.startTransaction`
8. [ ] Делегирует логику в `decide`, не содержит бизнес-правил
9. [ ] Зарегистрирован в `providers` модуля

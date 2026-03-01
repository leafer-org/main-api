# Domain — Functional Decider

Все агрегаты создаются в функциональном стиле: **Decide + Apply**.

- **decide** — чистая функция, `(State | null, Command) => Either<DomainError, Event>`. Нет побочных эффектов.
- **apply** — чистый редюсер, `(State | null, Event) => State`. Применяет событие к состоянию.

I/O остаётся в application-слое (interactor).

---

## Структура файлов агрегата

### Сложный агрегат (много команд):
```
domain/aggregates/<aggregate>/
├── state.ts, events.ts, commands.ts, errors.ts, config.ts
├── apply.ts + apply.test.ts
└── decide/           ← по файлу на команду
    ├── send-otp.ts + send-otp.test.ts
    └── verify-otp.ts + verify-otp.test.ts
```

### Простой агрегат:
```
domain/aggregates/<aggregate>/
├── state.ts, events.ts, commands.ts, errors.ts
├── apply.ts + apply.test.ts
└── decide.ts + decide.test.ts   ← все команды в switch
```

Выбор — по объёму логики. Если каждый case — 3-5 строк, хватит одного файла.

---

## Компоненты агрегата

### State (state.ts)

Иммутабельные данные без методов. Несколько фаз — discriminated union по `type`. Простой — plain type. Предикаты — отдельные функции.

```ts
// Discriminated union — LoginProcess
type LoginProcessStateBase = {
  id: LoginProcessId;
  phoneNumber: PhoneNumber;
  fingerPrint: FingerPrint;
};

export type RequestedLoginProcessState = LoginProcessStateBase & {
  type: 'OtpRequested';
  codeHash: OtpCodeHash;
  expiresAt: Date;
  verifyAttempts: number;
  requestedAt: Date;
};

export type LoginProcessState =
  | RequestedLoginProcessState
  | NewRegistrationLoginProcessState
  | SuccessLoginProcessState
  | BlockedLoginProcessState
  | LoginProcessErroredState;

// Предикаты — функции, не методы
export function isTerminalState(state: LoginProcessState, now: Date): boolean { /* ... */ }
export function isOtpExpired(state: LoginProcessState, now: Date): boolean { /* ... */ }
```

- Эталон union: `src/features/idp/domain/aggregates/login-process/state.ts`
- Эталон plain: `src/features/idp/domain/aggregates/user/state.ts`

### Events (events.ts)

Discriminated union по `type` вида `'aggregate.event_name'`. Только данные для перехода состояния.

```ts
export type UserCreatedEvent = {
  type: 'user.created';
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  role: Role;
  createdAt: Date;
};

export type UserEvent = UserCreatedEvent | UserProfileUpdatedEvent | UserRoleUpdatedEvent;
```

- Эталон: `src/features/idp/domain/aggregates/user/events.ts`

### Commands (commands.ts)

Discriminated union по `type`. Зависимости инъектируются через поля (`now: Date`, `generateId`). Никаких `Date.now()` внутри.

```ts
export type CreateUserCommand = {
  type: 'CreateUser';
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  role: Role;
  now: Date;          // ← инъектируется из interactor'а
};
```

- Эталон: `src/features/idp/domain/aggregates/user/commands.ts`

### Decide (decide.ts | decide/*.ts)

`(State | null, Command) => Either<Error, Event>`. Чистая функция. `Left` — отклонено, `Right` — принято. `assertNever` в default.

```ts
export function sendOtpCommandDecide(
  state: LoginProcessState | null,
  command: CreateOtpCommand,
): Either<LoginBlockedError | OtpThrottleError, LoginProcessStartedEvent> {
  if (state?.type === 'Blocked' && state.blockedUntil.getTime() > command.now.getTime()) {
    return Left(new LoginBlockedError({ blockedUntil: state.blockedUntil }));
  }

  if (!state || state.type === 'Errored' || state.type === 'Success') {
    return Right({
      type: 'login_process.started',
      id: command.newLoginProcessId,
      phoneNumber: command.phoneNumber,
      /* ... */
    });
  }

  assertNever(state);
}
```

- Эталон (один файл): `src/features/idp/domain/aggregates/user/decide.ts`
- Эталон (папка): `src/features/idp/domain/aggregates/login-process/decide/send-otp.ts`

### Apply (apply.ts)

`(State | null, Event) => State`. Чистый редюсер. `null` допустим только для начального события. `switch` + `assertNever`.

```ts
export function userApply(state: UserState | null, event: UserEvent): UserState {
  switch (event.type) {
    case 'user.created':
      return {
        id: event.id,
        phoneNumber: event.phoneNumber,
        fullName: event.fullName,
        role: event.role,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
      };
    case 'user.profile_updated': {
      if (!state) throw new Error('State is required');
      return { ...state, fullName: event.fullName, updatedAt: event.updatedAt };
    }
    default:
      assertNever(event);
  }
}
```

С удалением (`=> State | null`): `src/features/idp/domain/aggregates/session/apply.ts`

### Errors (errors.ts)

`CreateDomainError('Name')` из `@/infra/ddd/error.js`. С данными: `.withData<T>()`.

```ts
export class OtpThrottleError extends CreateDomainError('otp_throttle').withData<{
  retryAfterSec: number;
}>() {}

export class InvalidOtpError extends CreateDomainError('invalid_otp') {}
```

- Эталон: `src/features/idp/domain/aggregates/login-process/errors.ts`

### Config (config.ts)

Константы. Необязательный файл.
- Эталон: `src/features/idp/domain/aggregates/login-process/config.ts`

---

## Value Objects

Брендированные типы через `ValueObject<T, Brand>` из `@/infra/ddd/value-object.js`.

```ts
// VO с валидацией
export type PhoneNumber = ValueObject<string, 'PhoneNumber'>;

export const PhoneNumber = {
  create(value: string): Either<InvalidPhoneError, PhoneNumber> {
    if (!isValid(value)) return Left(new InvalidPhoneError());
    return Right(value as PhoneNumber);
  },
  raw(value: string): PhoneNumber {       // без валидации, для восстановления из БД
    return value as PhoneNumber;
  },
};
```

- `create()` — с валидацией, возвращает `Either`
- `raw()` — без валидации, для восстановления из БД

---

## Policy

Доменное бизнес-правило из Event Storming: "**когда** событие X, **тогда** команда Y".

Чистая функция `(Event, Deps) → Command`, живёт в `domain/policies/`. Вызывается из interactor'а (синхронный flow) или handler'а (асинхронная реакция).

```ts
// domain/policies/when-login-completed-create-session.policy.ts
export function whenLoginCompletedCreateSession(
  event: LoginCompletedEvent,
  deps: { sessionId: SessionId; now: Date; ttlMs: number },
): CreateSessionCommand {
  return {
    type: 'CreateSession',
    id: deps.sessionId,
    userId: event.userId,
    now: deps.now,
    ttlMs: deps.ttlMs,
  };
}
```

Синхронный flow в interactor'е: `command → decide → event → policy → command → decide → event → persist`

| Компонент | Триггер | Слой | Чистая? |
|-----------|---------|------|---------|
| **Interactor** | HTTP-запрос | Application | Нет (I/O) |
| **Handler** | Доменное событие | Application | Нет (I/O) |
| **Policy** | — | Domain | Да |

- Эталон: `src/features/idp/domain/policies/when-registration-completed-create-user.policy.ts`

---

## Read Model и Projection

### Вариант 1 — Query (основной)

Простой запрос: interactor в `application/queries/` вызывает query port, получает read model.

```
Application: Query Interactor → QueryPort → ReadModel
```

### Вариант 2 — Projection (по необходимости)

Для денормализованных данных из нескольких агрегатов. Projection — чистая функция в домене:

```
project: (ReadModel | null, Event) => ReadModel
```

Handler в `application/queries/` подписан на событие, вызывает projection, сохраняет результат.

| | Write | Read (projection) |
|---|---|---|
| **Domain** | `decide(state, command) → event` | `project(state, event) → readModel` |
| **Application** | Interactor: load → decide → apply → save | Handler: load → project → save |

### Структура файлов read model

Простой (тип + projection в одном файле):
```
domain/read-models/
└── user-profile.read-model.ts
```

Сложный (папка):
```
domain/read-models/
└── active-sessions/
    ├── active-sessions.read-model.ts
    └── active-sessions.projection.ts
```

Read model живёт на уровне feature (не агрегата), потому что может собирать данные из нескольких агрегатов.

---

## Структура домена feature

```
domain/
├── aggregates/
│   ├── login-process/
│   ├── user/
│   └── session/
├── policies/
│   └── when-*.policy.ts
├── read-models/
│   ├── me.read-model.ts
│   └── user-sessions.read-model.ts
└── vo/
    ├── phone-number.ts
    ├── otp.ts
    └── finger-print.ts
```

---

## Тестирование домена

- **Decide** — чистые функции → без моков. Тестируй `(state, command) => Either`. Группируй по команде.
- **Apply** — тестируй каждый event, начальное создание (null), throw при невалидном state.
- Примеры: `src/features/idp/domain/aggregates/user/decide.test.ts`, `src/features/idp/domain/aggregates/login-process/apply.test.ts`

---

## Чек-лист нового агрегата

1. [ ] `AggregateId` в `@/kernel/domain/ids.ts`
2. [ ] `state.ts` — состояние
3. [ ] `events.ts` — события
4. [ ] `commands.ts` — команды
5. [ ] `errors.ts` — ошибки
6. [ ] `config.ts` — константы (если нужны)
7. [ ] `apply.ts` + тесты
8. [ ] `decide.ts` (или `decide/`) + тесты

---

## Антипаттерны

- **НЕ** делай decide нечистой (без I/O, рандома, Date.now())
- **НЕ** бросай исключения для бизнес-ошибок — `Left(error)`
- **НЕ** добавляй методы к state — это чистые данные
- **НЕ** смешивай decide и apply
- **НЕ** используй ООП Entity-класс для агрегатов
- **НЕ** хардкодь `new Date()` / `crypto.randomUUID()` в decide
- **НЕ** определяй ID агрегатов в feature-файлах — только `@/kernel/domain/ids.ts`

---

## Инфра-зависимости домена

| Что | Импорт |
|-----|--------|
| Either, Left, Right, isLeft | `@/infra/lib/box.js` |
| CreateDomainError | `@/infra/ddd/error.js` |
| Entity IDs (branded) | `@/kernel/domain/ids.js` |
| Value Objects | `@/infra/ddd/value-object.js` |
| assertNever | `@/infra/ddd/utils.js` |

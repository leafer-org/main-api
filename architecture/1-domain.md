# Domain — Агрегаты и Сущности

## Агрегат vs Сущность

| | Агрегат (`entity.ts`) | Сущность (`entities/*.entity.ts`) |
|---|---|---|
| **Возвращает** | `Either<Error, { state; event }>` | Произвольный результат (новый state, getter, `Either`) |
| **События** | Создаёт доменные события | **Не создаёт** событий |
| **Роль** | Оркестратор: делегирует сущностям, собирает state + event | Чистая логика подобъекта |

**Агрегат** — тип состояния + одноимённый объект с чистыми методами. Каждый метод совмещает decide и apply: принимает состояние и команду, возвращает `Either<Error, { state; event }>`.

**Сущность** — подобъект агрегата. Тип + одноимённый const-объект с чистыми методами произвольной сигнатуры:
- **Мутации**: `(state, ...) => NewState` или `(state, ...) => Either<Error, NewState>`
- **Геттеры/запросы**: `(state, ...) => T | undefined`, `(state, ...) => boolean`
- **Фабрики**: `(...) => State`

I/O остаётся в application-слое (interactor).

---

## Структура файлов агрегата

```
domain/aggregates/<aggregate>/
├── entity.ts          ← агрегат: тип состояния + объект с методами
├── entities/          ← сущности (подобъекты агрегата, опционально)
│   └── <sub>.entity.ts
├── events.ts
├── commands.ts
├── errors.ts
└── config.ts          ← константы (если нужны)
```

---

## Компоненты агрегата

### Entity (entity.ts)

Тип состояния — `EntityState<T>` (синоним `Readonly<T>`). Одноимённый const-объект содержит методы агрегата.

Каждый метод — чистая функция:
- **create**: `(Command) => Either<Error, { state; event }>` — начальное создание, без state
- **остальные**: `(State, Command) => Either<Error, { state; event }>` — мутации

```ts
import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';

export type CategoryEntity = EntityState<{
  id: CategoryId;
  name: string;
  status: 'draft' | 'published' | 'unpublished';
  createdAt: Date;
  updatedAt: Date;
}>;

export const CategoryEntity = {
  create(
    cmd: CreateCategoryCommand,
  ): Either<InvalidAllowedTypeIdsError, { state: CategoryEntity; event: CategoryCreatedEvent }> {
    const typeValidation = validateAllowedTypeIds(/* ... */);
    if (isLeft(typeValidation)) return typeValidation;

    const event: CategoryCreatedEvent = {
      type: 'category.created',
      id: cmd.id,
      name: cmd.name,
      createdAt: cmd.now,
    };

    const state: CategoryEntity = {
      id: event.id,
      name: event.name,
      status: 'draft',
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    };

    return Right({ state, event });
  },

  update(
    state: CategoryEntity,
    cmd: UpdateCategoryCommand,
  ): Either<InvalidAllowedTypeIdsError, { state: CategoryEntity; event: CategoryUpdatedEvent }> {
    const event: CategoryUpdatedEvent = { type: 'category.updated', name: cmd.name, updatedAt: cmd.now };
    const newState: CategoryEntity = { ...state, name: event.name, updatedAt: event.updatedAt };
    return Right({ state: newState, event });
  },

  unpublish(
    state: CategoryEntity,
    cmd: UnpublishCategoryCommand,
  ): Either<CategoryNotPublishedError, { state: CategoryEntity; event: CategoryUnpublishedEvent }> {
    if (state.status !== 'published') return Left(new CategoryNotPublishedError());
    const event: CategoryUnpublishedEvent = { type: 'category.unpublished', categoryId: state.id, unpublishedAt: cmd.now };
    return Right({ state: { ...state, status: 'unpublished', updatedAt: cmd.now }, event });
  },
};
```

Для больших агрегатов вспомогательную логику можно выносить в методы Value Object или в чистые функции рядом с объектом агрегата (выше или ниже):

```ts
// Чистая функция-хелпер рядом с агрегатом
function validateAllowedTypeIds(
  allowedTypeIds: string[],
  parentAllowedTypeIds: string[] | null,
): Either<InvalidAllowedTypeIdsError, void> {
  if (!parentAllowedTypeIds) return Right(undefined);
  const invalid = allowedTypeIds.filter((id) => !new Set(parentAllowedTypeIds).has(id));
  if (invalid.length > 0) return Left(new InvalidAllowedTypeIdsError({ invalidTypeIds: invalid }));
  return Right(undefined);
}

// Или метод Value Object
export const CategoryAttribute = {
  mergeWithAncestors(own: { attributes: CategoryAttribute[] }, ancestors: /* ... */): CategoryAttribute[] {
    /* ... */
  },
};
```

- Эталон: `src/features/cms/domain/aggregates/category/entity.ts`

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

Типы команд без discriminated union (нет `type`). Зависимости инъектируются через поля (`now: Date`, `generateId`). Никаких `Date.now()` внутри.

```ts
export type CreateCategoryCommand = {
  id: CategoryId;
  name: string;
  iconId: FileId | null;
  allowedTypeIds: TypeId[];
  parentCategoryId: CategoryId | null;
  parentAllowedTypeIds: TypeId[] | null;
  now: Date;
};
```

- Эталон: `src/features/cms/domain/aggregates/category/commands.ts`

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

### Сущности (entities/)

Для больших агрегатов подобъекты выделяются в **сущности** — отдельные файлы в `entities/` внутри агрегата.

**Отличие от агрегата**: сущность **не создаёт доменных событий**. Методы возвращают новый state, результат запроса или `Either<Error, T>` для валидации. Событие создаёт только агрегат-оркестратор.

Кросс-импорты между сущностями разрешены.

```ts
// entities/info-draft.entity.ts
export type InfoDraftEntity = EntityState<{
  name: string;
  description: string;
  avatarId: FileId | null;
  status: 'draft' | 'moderation-request' | 'rejected';
}>;

export const InfoDraftEntity = {
  // Фабрика
  create(name: string, description: string, avatarId: FileId | null): InfoDraftEntity {
    return { name, description, avatarId, status: 'draft' };
  },
  // Мутация → новый state
  update(state: InfoDraftEntity, name: string, desc: string, avatarId: FileId | null): InfoDraftEntity {
    return { name, description: desc, avatarId, status: 'draft' };
  },
  // Мутация с валидацией → Either
  submitForModeration(state: InfoDraftEntity): Either<InfoNotInDraftError, InfoDraftEntity> {
    if (state.status !== 'draft' && state.status !== 'rejected') return Left(new InfoNotInDraftError());
    return Right({ ...state, status: 'moderation-request' });
  },
  // Геттер
  canSubmit(state: InfoDraftEntity): boolean {
    return state.status === 'draft' || state.status === 'rejected';
  },
};
```

Агрегат делегирует сущности и создаёт событие:

```ts
// entity.ts
export const OrganizationEntity = {
  submitInfoForModeration(state, cmd) {
    const result = InfoDraftEntity.submitForModeration(state.infoDraft);
    if (isLeft(result)) return result;
    const event: InfoSubmittedForModerationEvent = { type: '...', ... };
    return Right({ state: { ...state, infoDraft: result.value, updatedAt: cmd.now }, event });
  },
};
```

- Эталон: `src/features/organization/domain/aggregates/organization/entities/`

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

- Entity-методы — чистые функции → без моков. Тестируй `(state, command) => Either<Error, { state, event }>`. Группируй по методу.
- Примеры: `src/features/cms/domain/aggregates/category/entity.ts`

---

## Чек-лист нового агрегата

1. [ ] `AggregateId` в `@/kernel/domain/ids.ts`
2. [ ] `entity.ts` — тип состояния + объект с методами
3. [ ] `entities/` — сущности-подобъекты (если агрегат большой)
4. [ ] `events.ts` — события
5. [ ] `commands.ts` — команды
6. [ ] `errors.ts` — ошибки
7. [ ] `config.ts` — константы (если нужны)

---

## Антипаттерны

- **НЕ** делай методы entity нечистыми (без I/O, рандома, Date.now())
- **НЕ** бросай исключения для бизнес-ошибок — `Left(error)`
- **НЕ** разделяй decide и apply в разные файлы — используй единый entity
- **НЕ** используй ООП Entity-класс (наследование) для агрегатов
- **НЕ** хардкодь `new Date()` / `crypto.randomUUID()` в entity-методах
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

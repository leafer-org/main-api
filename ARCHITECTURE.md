# Архитектура — Functional Decider

Все новые агрегаты создаются только в функциональном стиле (Decide + Apply).

---

## Структура домена (feature)

```
domain/
├── aggregates/
│   ├── login-process/
│   ├── user/
│   └── session/
├── policies/
│   └── when-*.policy.ts                  ← Event (+Deps) → Command (чистая)
├── read-models/
│   ├── user-profile.read-model.ts        ← простой: тип + projection в одном файле
│   └── active-sessions/                  ← сложный: папка
│       ├── active-sessions.read-model.ts ← тип
│       └── active-sessions.projection.ts ← projection
└── vo/
    └── ...
```

```
application/
├── use-cases/                             ← write side
│   └── otp-flow/
│       ├── send-otp.interactor.ts
│       └── verify-otp.interactor.ts
└── queries/                               ← read side
    └── user-profile/
        ├── get-user-profile.interactor.ts ← HTTP → repository → ReadModel
        └── on-user-changed.handler.ts     ← Event → projection → save
```

---

## Паттерн: Decide + Apply (Decider)

```
decide: (State | null, Command) => Either<DomainError, Event>
apply:  (State | null, Event)   => State
```

- **decide** — чистая функция, возвращает `Either<Error, Event>`. Нет побочных эффектов.
- **apply** — чистый редюсер, применяет событие к состоянию.

I/O остаётся в application-слое (interactor).

---

## Use Case и Interactor

**Use Case** — бизнес-сценарий целиком (например, "вход по OTP"). Может состоять из нескольких последовательных взаимодействий пользователя с системой.

**Interactor** — обработчик одного шага взаимодействия внутри use case. Один request-response цикл.

```
application/use-cases/<use-case-name>/
├── send-otp.interactor.ts       ← шаг 1
├── verify-otp.interactor.ts     ← шаг 2
└── ...
```

Ответственности interactor'а:
1. Парсинг входных данных → Value Objects
2. Загрузка состояния из репозитория
3. Вызов `decide` (чистая доменная функция)
4. Вызов `apply` для нового состояния
5. Персистенция и побочные эффекты

Правила:
- Interactor **не содержит** бизнес-логики — делегирует в `decide`
- Оборачивает операции в транзакцию (`txHost.startTransaction`)
- Прокидывает ошибки через `Either` (`isLeft` на каждом шаге)
- Инъектирует зависимости в команду (`now`, `generateId`, `otpCode`)

Эталон: `src/features/idp/application/use-cases/otp-flow/send-otp.interactor.ts`

---

## Policy и Event Handler

Терминология из Event Storming:

**Policy** — доменное бизнес-правило: "**когда** событие X, **тогда** команда Y". Чистая функция `(Event, Deps) → Command`, живёт в `domain/policies/`. Всегда выделяется в отдельный файл для соответствия Event Storming модели. Вызывается из interactor'а (синхронный flow) или handler'а (асинхронная реакция).

**Handler** — оркестрация реакции на доменное событие. По структуре идентичен interactor'у, но триггерится событием, а не HTTP-запросом.

```
domain/policies/
└── when-registration-completed-create-user.policy.ts   ← Event (+Deps) → Command

application/use-cases/otp-flow/
├── send-otp.interactor.ts          ← HTTP-запрос
├── verify-otp.interactor.ts        ← HTTP-запрос, может вызвать policy для синхронного flow
└── on-otp-verified.handler.ts      ← асинхронная реакция на событие
```

Синхронный flow в interactor'е: `command → decide → event → policy → command → decide → event → persist`

| Компонент | Триггер | Слой | Чистая? |
|-----------|---------|------|---------|
| **Interactor** | HTTP-запрос | Application | Нет (I/O) |
| **Handler** | Доменное событие | Application | Нет (I/O) |
| **Policy** | — | Domain | Да |

- Пример: `src/features/idp/domain/policies/when-registration-completed-create-user.policy.ts`

---

## Read Model и Projection

Два варианта получения read model:

### Вариант 1 — Query (основной)

Простой запрос: interactor в `application/queries/` вызывает repository port, получает read model. Покрывает большинство случаев.

```
Application: Query Interactor → Repository (port) → ReadModel
```

### Вариант 2 — Projection (по необходимости)

Для денормализованных данных из нескольких агрегатов или для высокой скорости чтения. Projection — чистая функция, живёт в домене рядом с read model.

```
project: (ReadModel | null, Event) => ReadModel
```

Handler в `application/queries/` подписан на событие, вызывает projection, сохраняет результат.

Симметрия с write side:

| | Write | Read (projection) |
|---|---|---|
| **Domain** | `decide(state, command) → event` | `project(state, event) → readModel` |
| **Application** | Handler: load → decide → apply → save | Handler: load → project → save |

### Структура файлов read model

Простой (тип + projection в одном файле):
```
domain/read-models/
└── user-profile.read-model.ts    ← тип + projection
```

Сложный (папка):
```
domain/read-models/
└── active-sessions/
    ├── active-sessions.read-model.ts    ← тип
    └── active-sessions.projection.ts    ← projection
```

Read model живёт на уровне feature (не агрегата), потому что может собирать данные из нескольких агрегатов.

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
- Пример union: `src/features/idp/domain/login-process/state.ts`
- Пример plain: `src/features/idp/domain/user/state.ts`

### Events (events.ts)
Discriminated union по `type` вида `'aggregate.event_name'`. Только данные для перехода состояния.
- Пример: `src/features/idp/domain/user/events.ts`

### Commands (commands.ts)
Discriminated union по `type`. Зависимости инъектируются через поля (`now: Date`, `generateId`). Никаких `Date.now()` внутри.
- Пример: `src/features/idp/domain/user/commands.ts`

### Decide (decide.ts | decide/*.ts)
`(State | null, Command) => Either<Error, Event>`. Чистая функция. `Left` — отклонено, `Right` — принято. `assertNever` в default.
- Пример (один файл): `src/features/idp/domain/user/decide.ts`
- Пример (папка): `src/features/idp/domain/login-process/decide/send-otp.ts`

### Apply (apply.ts)
`(State | null, Event) => State`. Чистый редюсер. `null` допустим только для начального события. `switch` + `assertNever`.
- Пример: `src/features/idp/domain/user/apply.ts`
- С удалением (`=> State | null`): `src/features/idp/domain/session/apply.ts`

### Errors (errors.ts)
`CreateDomainError('Name')` из `@/infra/ddd/error.js`. С данными: `.withData<T>()`.
- Пример: `src/features/idp/domain/login-process/errors.ts`

### Config (config.ts)
Константы. Необязательный файл.
- Пример: `src/features/idp/domain/login-process/config.ts`

---

## Инфраструктурные зависимости

| Что | Импорт |
|-----|--------|
| Either, Left, Right, isLeft | `@/infra/lib/box.js` |
| CreateDomainError | `@/infra/ddd/error.js` |
| Entity IDs (branded) | `@/kernel/domain/ids.js` |
| Value Objects | `@/infra/ddd/value-object.js` |
| assertNever | `@/infra/ddd/utils.js` |

---

## Тестирование

- **Decide**: чистые функции → без моков. Тестируй `(state, command) => Either`. Группируй по команде.
- **Apply**: тестируй каждый event, начальное создание (null), throw при невалидном state.
- Примеры: `src/features/idp/domain/user/decide.test.ts`, `src/features/idp/domain/login-process/apply.test.ts`

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
- **НЕ** используй ООП Entity-класс
- **НЕ** хардкодь `new Date()` / `crypto.randomUUID()` в decide
- **НЕ** определяй ID агрегатов в feature-файлах — только `@/kernel/domain/ids.ts`

---

## Агрегаты в проекте

| Агрегат | Путь | Decide | Состояние |
|---------|------|--------|-----------|
| LoginProcess | `domain/aggregates/login-process/` | `decide/` (папка) | discriminated union |
| User | `domain/aggregates/user/` | `decide.ts` (файл) | простой тип |
| Session | `domain/aggregates/session/` | `decide.ts` (файл) | простой тип, apply → `State \| null` |

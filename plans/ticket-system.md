# Feature: Тикет-система (Tickets)

## Концепция

Система заявок для информирования и координации операционистов:
- **Триггеры** — union в коде. Каждый триггер автоматически создаёт тикеты из бизнес-событий.
- **Данные тикета (TicketData)** — flat-структура с optional полями. Каждое поле — снимок данных привязанной сущности. Заполняется из триггера, один тикет может содержать данные нескольких сущностей. Тикеты можно создавать и вручную.
- **Фильтры** — два вида: декларативные (json-logic по payload) и программные (хардкод со сложной логикой, например "каждый 10-й", "первая публикация организации"). Комбинируются на подписках досок.
- **Доски (Board)** — динамические, из админки. Подписываются на триггеры с фильтрами, назначают обработчиков, настраивают автоматизацию. Любой тикет можно перенаправить на любую доску (эскалация).

Тикет-система **только информирует и координирует** — операционист видит тикет с данными, переходит в нужный интерфейс (модерация item, профиль организации и т.д.), выполняет действие там, возвращается и закрывает тикет. Действия над сущностями выполняются напрямую через фронтенд в целевые сервисы.

Ядро переиспользуется для двух контекстов:
- **Platform** — глобальные доски для админов (модерация, жалобы)
- **Organization** — доски внутри организации (обращения клиентов, задачи)

---

## Ключевые решения

### Тикет-система не выполняет действия

Тикет-система — это **workflow-engine**, а не action-executor. Она создаёт тикеты, назначает операционистов, отслеживает статус. Все действия над сущностями (approve item, reject org и т.д.) выполняются операционистом **напрямую** в соответствующих интерфейсах. Это снижает coupling и упрощает доменную модель.

### Дублирование тикетов при множественных подписках

Один триггер может создать **отдельные тикеты** на каждой подписанной доске — это разные агрегаты с разными `ticketId`. Дедупликации нет.

### LLM работает только с `open` тикетами

Automation обрабатывает только тикеты в статусе `open`. Если оператор успел взять тикет (`in-progress`) раньше LLM — автоматизация его пропускает. Есть специальный пермишен, позволяющий забрать уже взятый тикет у другого оператора или переназначить на другого member.

### Программный фильтр `every-nth` — счётчик в Redis

Счётчик глобальный на триггер (не на подписку и не на доску). Хранится в Redis. Инкрементируется при каждом срабатывании триггера, независимо от результата json-logic фильтров.

### Программные фильтры с внешними зависимостями

Фильтры типа `first-time-org` и `repeat-offender` требуют запроса в БД. Для этого существует **отдельный порт** (`ProgrammaticFilterContext` или аналог), который предоставляет данные фильтрам.

### LLM: reason сохраняется в history + комментарий

LLM оставляет комментарий с причиной решения. При перенаправлении на другую доску (uncertain) комментарий обязателен. Всё отражается в `history`.

### LLM: без retry

Если Claude API вернул ошибку или timeout — тикет остаётся `open` (или перенаправляется на доску из `onUncertain.moveToBoardId`). Retry-политики нет.

### Изоляция org и platform

Эскалации между org-досками и platform-досками **не существует**. Организация может написать обращение к поддержке — это отдельный триггер для platform-контекста. Platform-админ может видеть тикеты org-доски только со специальным пермишеном (для безопасности в редких случаях).

---

## Данные тикета (flat VO)

`TicketData` — набор optional полей, каждое из которых — снимок данных привязанной сущности. Заполняется из триггера при создании тикета. Один тикет может содержать данные нескольких сущностей одновременно.

```ts
// domain/vo/ticket-data.ts

type TicketItemData = {
  id: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  title: string;
  description: string;
  imageUrl: string | null;
  categoryIds: CategoryId[];
};

type TicketOrganizationData = {
  id: OrganizationId;
  name: string;
  description: string;
  avatarUrl: string | null;
};

type TicketData = {
  item?: TicketItemData;
  organization?: TicketOrganizationData;
  // расширяется:
  // itemDraft?: TicketItemDraftData;
  // organizationDraft?: TicketOrganizationDraftData;
  // chat?: TicketChatData;
  // chatMessage?: TicketChatMessageData;
  // user?: TicketUserData;
};
```

Новая сущность = новое optional поле в `TicketData` + обновление триггеров.

По заполненным полям определяется:
- Какие данные отображать в UI (ссылки на сущности для перехода в нужный интерфейс)
- Как извлекать контент для LLM

---

## Триггеры (union, в коде)

Триггер связывает Kafka-событие с созданием тикета. Статический набор. Каждый триггер знает, какие поля `TicketData` он заполняет и какой `message` генерирует.

```ts
// domain/vo/triggers.ts

type TriggerId =
  | 'item.moderation-requested'
  | 'organization.moderation-requested';
  // расширяется:
  // | 'review.reported'
  // | 'user.reported'

// Метаданные триггеров (для UI — справочник)
const TRIGGER_META: Record<TriggerId, { name: string; scope: 'platform' | 'organization' }> = {
  'item.moderation-requested': { name: 'Модерация товара', scope: 'platform' },
  'organization.moderation-requested': { name: 'Модерация организации', scope: 'platform' },
};
```

Добавление нового триггера:
1. Добавить member в `TriggerId`
2. Добавить optional поле в `TicketData` (если новая сущность)
3. Написать `KafkaHandler` который конвертирует событие → `{ message, data: TicketData }`

---

## Агрегат: Ticket

```ts
type TicketState = EntityState<{
  ticketId: TicketId;
  boardId: BoardId;

  // --- Содержание ---
  message: string;                          // текст обращения (обязателен, генерируется из триггера или вводится вручную)
  data: TicketData;                         // flat-структура с данными сущностей
  triggerId: TriggerId | null;             // null если создан вручную

  // --- Lifecycle ---
  status: 'open' | 'in-progress' | 'done';
  assigneeId: UserId | null;

  // --- История ---
  history: TicketHistoryEntry[];

  createdAt: Date;
  updatedAt: Date;
}>;
```

### Команды

```ts
type CreateTicketCommand = {
  type: 'CreateTicket';
  ticketId: TicketId;
  boardId: BoardId;
  message: string;
  data: TicketData;
  triggerId: TriggerId | null;            // null = ручное создание
  now: Date;
};

type AssignTicketCommand = { type: 'AssignTicket'; assigneeId: UserId; now: Date };
type ReassignTicketCommand = { type: 'ReassignTicket'; assigneeId: UserId; now: Date };  // требует спец. пермишен
type UnassignTicketCommand = { type: 'UnassignTicket'; now: Date };
type MoveTicketCommand = { type: 'MoveTicket'; toBoardId: BoardId; movedBy: UserId; comment: string; now: Date };
type MarkDoneCommand = { type: 'MarkDone'; now: Date };
type ReopenTicketCommand = { type: 'ReopenTicket'; now: Date };
type CommentTicketCommand = { type: 'CommentTicket'; authorId: UserId | 'automation'; text: string; now: Date };
```

### Domain Rules

1. **CreateTicket (вручную)** — доска должна иметь `manualCreation: true`. Создатель должен быть member доски.
2. **Assign** — только `open` тикеты. Assignee должен быть member доски. Статус → `in-progress`.
3. **Reassign** — `in-progress` тикет. Требует специальный пермишен. Позволяет забрать чужой тикет или передать другому member.
4. **Unassign** — только `in-progress`. Статус → `open`.
5. **Move** — можно из любого статуса кроме `done`. Целевая доска должна быть в `allowedTransferBoardIds` текущей доски. Если список пуст — перенаправление запрещено. **Комментарий обязателен**.
6. **MarkDone** — только `in-progress` (тикет должен быть назначен).
7. **Reopen** — только `done`. Статус → `open`, assignee сбрасывается.

### История

```ts
type TicketHistoryEntry = {
  action: 'created' | 'assigned' | 'reassigned' | 'unassigned' | 'moved'
        | 'done' | 'reopened' | 'commented';
  actorId: UserId | 'automation';
  data: Record<string, unknown>;           // { fromBoardId, toBoardId, comment } | { comment }
  timestamp: Date;
};
```

---

## Фильтры подписок

Два вида фильтров, комбинируются через AND в подписке:

### Декларативные — json-logic по payload

```ts
// Товары из категории "kids"
{ "in": ["kids-id", { "var": "categoryIds" }] }

// null = без фильтра
```

Библиотека: `json-logic-js` (~5KB, zero deps).

### Программные — хардкод со сложной логикой

Статический union в коде. Набор доступных фильтров **зависит от триггера** — у каждого триггера свой список применимых программных фильтров.

Фильтры с внешними зависимостями (например `first-time-org` — есть ли у организации уже опубликованные товары) получают данные через **отдельный порт** (`ProgrammaticFilterContext`).

```ts
// domain/vo/filters.ts

// --- Универсальные (доступны для любого триггера) ---
type UniversalFilterId = 'every-nth' | 'random-sample';

// --- Специфичные для триггеров с organizationId ---
type OrgFilterId = 'first-time-org' | 'repeat-offender';

// --- Специфичные для триггеров с itemId ---
type ItemFilterId = 'high-price';

// Маппинг: какие программные фильтры доступны для каждого триггера
type TriggerFilters = {
  'item.moderation-requested': UniversalFilterId | OrgFilterId | ItemFilterId;
  'organization.moderation-requested': UniversalFilterId | OrgFilterId;
};

// Метаданные фильтров (для UI)
const FILTER_META = {
  'every-nth': {
    name: 'Каждый N-й',
    params: [{ key: 'n', label: 'N', type: 'number' as const }],
  },
  'random-sample': {
    name: 'Случайная выборка %',
    params: [{ key: 'percent', label: 'Процент', type: 'number' as const }],
  },
  'first-time-org': {
    name: 'Первая публикация организации',
    params: [],
  },
  'repeat-offender': {
    name: 'Организация с историей отклонений',
    params: [],
  },
  'high-price': {
    name: 'Цена выше порога',
    params: [{ key: 'threshold', label: 'Порог', type: 'number' as const }],
  },
} as const;
```

Когда админ настраивает подписку доски на триггер — UI показывает только фильтры, применимые к этому триггеру.

### `every-nth` — глобальный счётчик

Счётчик хранится в **Redis**, ключ — `trigger-counter:{triggerId}`. Инкрементируется при каждом срабатывании триггера (до проверки json-logic фильтров). Фильтр пропускает события где `counter % n === 0`.

### Комбинация в подписке

```ts
type SubscriptionFilter =
  | { type: 'json-logic'; rule: JsonLogicRule }
  | { type: 'programmatic'; filterId: string; params: Record<string, unknown> };
  // filterId валидируется по TriggerFilters[triggerId]

type BoardSubscription = {
  triggerId: TriggerId;
  filters: SubscriptionFilter[];           // AND — все должны пройти
};
```

**Пример: пост-модерация каждого 10-го одобренного товара из категории "дети":**
```ts
{
  triggerId: 'item.moderation-approved',
  filters: [
    { type: 'json-logic', rule: { "in": ["kids-id", { "var": "categoryIds" }] } },
    { type: 'programmatic', filterId: 'every-nth', params: { n: 10 } },
  ],
}
```

---

## Агрегат: Board (доска)

Доска — конфигурируемая очередь тикетов. Создаётся админом через UI. Любой тикет можно перенаправить на любую доску — ограничений по типу нет.

`BoardSubscriptionEntity` и `BoardAutomationEntity` — **sub-entities** (не VO), т.к. имеют собственный `id`, жизненный цикл (add/remove) и поведение (enable/disable). Типы определены inline в `entities/` внутри агрегата Board. Не создают событий — делегирование и событие создаёт BoardEntity. Операции удаления по `id` (не по индексу).

```ts
type BoardState = EntityState<{
  boardId: BoardId;
  name: string;                                   // 'Модерация товаров'
  description: string | null;
  scope: 'platform' | 'organization';
  organizationId: OrganizationId | null;          // если scope === 'organization'

  // --- Автоматическое создание тикетов ---
  subscriptions: BoardSubscriptionEntity[];       // sub-entity (id: BoardSubscriptionId)

  // --- Ручное создание ---
  manualCreation: boolean;                        // можно ли создавать тикеты вручную на этой доске

  // --- Маршрутизация (куда можно перенаправить) ---
  allowedTransferBoardIds: BoardId[];             // список досок для перенаправления
  // пустой = перенаправление запрещено

  // --- Обработчики ---
  memberIds: UserId[];

  // --- LLM автоматизация ---
  automations: BoardAutomationEntity[];           // sub-entity (id: BoardAutomationId)

  createdAt: Date;
  updatedAt: Date;
}>;
```

### Пример конфигурации

```ts
// Доска "Модерация товаров" — LLM обрабатывает, uncertain → ручная проверка
{
  boardId: 'item-moderation-board',
  name: 'Модерация товаров',
  scope: 'platform',
  subscriptions: [
    { triggerId: 'item.moderation-requested', filters: [] },
  ],
  manualCreation: false,
  allowedTransferBoardIds: ['manual-review-board', 'kids-review-board'],
  memberIds: [moderatorUserId],
  automation: { /* uncertain → move to manual-review-board */ },
}

// Доска "Ручная проверка" — сюда попадают спорные тикеты из LLM
{
  boardId: 'manual-review-board',
  name: 'Ручная проверка',
  scope: 'platform',
  subscriptions: [],
  manualCreation: false,
  allowedTransferBoardIds: ['kids-review-board', 'legal-board'],
  memberIds: [seniorModeratorUserId],
  automation: null,
}

// Доска "Проверка детских услуг" — специалисты по детскому контенту
{
  boardId: 'kids-review-board',
  name: 'Проверка детских услуг',
  scope: 'platform',
  subscriptions: [
    {
      triggerId: 'item.moderation-requested',
      filters: [
        { type: 'json-logic', rule: { "in": ["kids-id", { "var": "categoryIds" }] } },
      ],
    },
  ],
  manualCreation: true,
  allowedTransferBoardIds: ['manual-review-board'],
  memberIds: [kidsSpecialistUserId],
  automation: null,
}
```

Один триггер `item.moderation-requested` → тикет создаётся в обеих досках (если фильтр совпал).

---

## Ручное создание тикетов

Оператор может создать тикет вручную, если на доске `manualCreation: true`:
1. Выбрать доску (в которой он member и `manualCreation` включён)
2. Написать `message`
3. Опционально привязать данные сущностей (заполнить поля `data`)

`triggerId` у таких тикетов = `null`.

**Когда `manualCreation: false`** — тикеты попадают на доску только автоматически (через триггеры) или через перенаправление с другой доски. Это защищает автоматизированные доски от "мусорных" тикетов.

---

## Workflow тикета

У всех тикетов одинаковый workflow:

| Кнопка | Действие | Кто может |
|--------|----------|-----------|
| **Взять** | Назначить на себя → `in-progress` | Любой member доски |
| **Забрать/Передать** | Переназначить `in-progress` тикет | Member со спец. пермишеном |
| **Отказаться** | Убрать с себя → `open` | Текущий assignee |
| **Перенаправить** | Переместить на доску из `allowedTransferBoardIds` (комментарий обязателен) | Любой member доски |
| **Обработано** | → `done` | Текущий assignee |
| **Переоткрыть** | → `open` (из `done`) | Любой member доски |

**Действия над сущностями** (approve item, reject org и т.д.) выполняются операционистом в соответствующих интерфейсах, не через тикет-систему. Тикет предоставляет ссылки на сущности через `data`.

---

## LLM-автоматизация — модуль `ai-agent`

### Концепция

AI-агент — **полноценный актор** в системе со своим `UserId`, пермишенами и возможностью выполнять действия. Это отдельная feature `ai-agent`, а не просто обёртка над LLM API.

Взаимодействие:
- **Синхронный kernel-порт** `AiAgentDispatcher` — отправить задачу агенту (валидация: агент существует, включён, может принять задачу)
- **Kafka** — агент публикует результат как structured event после выполнения

В UI можно создать агента, выдать ему пермишены, и указать одного или нескольких агентов на доске с системным промптом.

### Kernel-порт: `AiAgentDispatcher`

```ts
// kernel/application/ports/ai-agent.ts

import type { Either } from '@/infra/lib/box.js';
import type { JsonSchema } from '@/infra/lib/json-schema.js';

/** Контент для анализа */
type AiContentBlock =
  | { type: 'text'; label: string; value: string }
  | { type: 'image'; url: string };

/** Задача для AI-агента */
type AiTaskRequest = {
  /** ID задачи (для корреляции с результатом в Kafka) */
  taskId: string;
  /** Тип задачи — для логов, метрик, маршрутизации */
  taskType: string;                        // 'ticket.moderation', 'ticket.classification', ...
  /** ID агента-исполнителя */
  agentId: AiAgentId;
  /** Системный промпт (из настроек доски) */
  systemPrompt: string;
  /** Контент для анализа */
  content: AiContentBlock[];
  /** JSON Schema ожидаемого результата — агент вернёт structured output по этой схеме */
  resultSchema: JsonSchema;
  /** Произвольный контекст — агент вернёт его обратно в результате (для корреляции) */
  context: Record<string, unknown>;        // { ticketId, boardId, ... }
};

type DispatchError =
  | { code: 'agent_not_found' }
  | { code: 'agent_disabled' };

/** Синхронный порт — отправить задачу агенту */
export abstract class AiAgentDispatcher {
  public abstract dispatch(
    task: AiTaskRequest,
  ): Promise<Either<DispatchError, { accepted: true }>>;
}
```

### Kernel integration events (Kafka)

```ts
// kernel/domain/events/ai-agent.events.ts

/** Агент завершил задачу — публикуется в Kafka */
type AiTaskCompletedEvent = {
  type: 'ai-agent.task.completed';
  taskId: string;
  taskType: string;
  agentId: AiAgentId;
  /** Структурированный результат (соответствует resultSchema из запроса) */
  result: Record<string, unknown>;
  /** Контекст, переданный при dispatch */
  context: Record<string, unknown>;
};

/** Агент не смог выполнить задачу */
type AiTaskFailedEvent = {
  type: 'ai-agent.task.failed';
  taskId: string;
  taskType: string;
  agentId: AiAgentId;
  error: { code: string; message: string };
  context: Record<string, unknown>;
};
```

### Как tickets использует ai-agent

#### BoardAutomation — ссылается на агента

```ts
type BoardAutomation = {
  enabled: boolean;
  agentId: AiAgentId;                      // какой агент обрабатывает
  systemPrompt: string;                    // промпт для этой доски
  onUncertain: {
    moveToBoardId: BoardId | null;
  };
};
```

#### Отправка задачи (tickets → ai-agent)

```ts
// features/tickets/application/use-cases/automation/process-automation.handler.ts

const MODERATION_RESULT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['approved', 'rejected', 'uncertain'] },
    reason: { type: 'string' },
  },
  required: ['decision', 'reason'],
};

// 1. Собираем контент из тикета
const content: AiContentBlock[] = [];
content.push({ type: 'text', label: 'Задача', value: ticket.message });

if (ticket.data.item) {
  content.push({ type: 'text', label: 'Название', value: ticket.data.item.title });
  content.push({ type: 'text', label: 'Описание', value: ticket.data.item.description });
  if (ticket.data.item.imageUrl) content.push({ type: 'image', url: ticket.data.item.imageUrl });
}

// 2. Dispatch через kernel-порт (с resultSchema)
const dispatched = await this.aiAgentDispatcher.dispatch({
  taskId: generateId(),
  taskType: 'ticket.moderation',
  agentId: automation.agentId,
  systemPrompt: automation.systemPrompt,
  content,
  resultSchema: MODERATION_RESULT_SCHEMA,
  context: { ticketId: ticket.ticketId, boardId: ticket.boardId },
});

// 3. Если агент не доступен — fallback (оставить open)
if (isLeft(dispatched)) { /* ... */ }
```

#### Получение результата (ai-agent → tickets через Kafka)

```ts
// features/tickets/adapters/kafka/ai-task-result.handler.ts

// Слушает 'ai-agent.task.completed' где taskType === 'ticket.moderation'

type ModerationResult = {
  decision: 'approved' | 'rejected' | 'uncertain';
  reason: string;
};

// result.context.ticketId → загрузить тикет
// result.result — соответствует MODERATION_RESULT_SCHEMA
// result.result.decision:
//   approved  → Assign(agent.userId) → Comment(reason) → MarkDone
//   rejected  → Assign(agent.userId) → Comment(reason) → MarkDone
//   uncertain → Comment(reason) → Move или оставить open

// Слушает 'ai-agent.task.failed'
//   → Comment(error.message) → оставить open или Move по onUncertain
```

### Flow автоматизации

```
Тикет создан на доске с automation (статус open)
  │
  ▼
ProcessAutomationHandler
  │ Проверяет что тикет всё ещё open
  │ Собирает AiContentBlock[] из ticket.message + ticket.data
  │ Вызывает AiAgentDispatcher.dispatch() — синхронно
  │   (передаёт resultSchema: MODERATION_RESULT_SCHEMA)
  │
  ├─ Left(agent_not_found/disabled) → тикет остаётся open
  │
  └─ Right(accepted) → тикет ждёт результата
       │
       ▼
  AI-агент (внутри ai-agent модуля):
       │ Получает задачу + resultSchema
       │ Вызывает LLM с systemPrompt + content
       │ Получает structured output по resultSchema
       │ Выполняет действия от своего UserId (approve/reject item и т.д.)
       │ Публикует AiTaskCompletedEvent в Kafka (result соответствует schema)
       │
       ▼
  AiTaskResultKafkaHandler (в tickets):
       │ Парсит result по taskType === 'ticket.moderation'
       │ Достаёт ticketId из context
       │
       ├─ approved  → Assign(agent) → Comment(reason) → MarkDone
       ├─ rejected  → Assign(agent) → Comment(reason) → MarkDone
       └─ uncertain/failed → Comment(reason) → оставить open / Move
```

### Модуль `ai-agent` — структура (без деталей реализации)

```
src/features/ai-agent/
  ai-agent.module.ts

  domain/
    aggregates/agent/              # Агрегат: создание, включение/выключение, настройки
      state.ts                     # AiAgentState { agentId, userId, name, enabled, model, ... }
      commands.ts
      events.ts
      entity.ts

  application/
    ports.ts                       # AiAgentRepository
    use-cases/
      create-agent.interactor.ts
      update-agent.interactor.ts
      disable-agent.interactor.ts
      process-task.handler.ts      # Получает задачу, вызывает LLM (structured output по resultSchema), выполняет действия, публикует результат

  adapters/
    http/
      agents.controller.ts         # CRUD агентов (админка)
    db/
      schema.ts
      agent.repository.ts
    llm/
      claude.adapter.ts            # Claude API (structured output)
      stub.adapter.ts              # Стаб для тестов
    kafka/
      task-result.publisher.ts     # Публикация AiTaskCompleted / AiTaskFailed

kernel:
  src/kernel/application/ports/ai-agent.ts    # AiAgentDispatcher порт
  src/kernel/domain/ids.ts                    # AiAgentId
  src/kernel/domain/events/ai-agent.events.ts # integration events
```

---

## Два контекста: Platform и Organization

Ядро одно, но разные ограничения:

| | Platform | Organization |
|---|---------|-------------|
| Кто создаёт доски | Глобальные админы | Сотрудники с пермишеном `manage_tickets` |
| Триггеры | `scope: 'platform'` | `scope: 'organization'` |
| Members | Глобальные пользователи | Сотрудники организации |
| Пермишены | `Permissions` (глобальные) | `OrganizationPermission` |
| Доступ | `/admin/...` | `/organizations/:orgId/...` |

Для org-контекста `BoardState.organizationId` задаёт изоляцию.

**Эскалации между org и platform нет.** Организация может написать обращение к поддержке — это отдельный триггер для platform-контекста. Platform-админ может видеть тикеты org-доски только со специальным пермишеном (`tickets.view_org_boards`).

---

## HTTP API

### Platform

```
# Доски
GET    /admin/boards                                    → GetBoards
POST   /admin/boards                                    → CreateBoard
PATCH  /admin/boards/:boardId                           → UpdateBoard
DELETE /admin/boards/:boardId                           → DeleteBoard

# Подписки на триггеры
POST   /admin/boards/:boardId/subscriptions             → AddSubscription { triggerId, filter }
DELETE /admin/boards/:boardId/subscriptions/:subId       → RemoveSubscription

# Участники
POST   /admin/boards/:boardId/members                   → AddMember { userId }
DELETE /admin/boards/:boardId/members/:userId            → RemoveMember

# Автоматизация
PUT    /admin/boards/:boardId/automation                → SetAutomation { model, prompt, ... }
DELETE /admin/boards/:boardId/automation                → DisableAutomation

# Справочники (readonly)
GET    /admin/ticket-triggers                           → GetTriggers (scope: platform)

# Тикеты
GET    /admin/tickets?boardId=&status=&assigneeId=      → GetTickets
GET    /admin/tickets/my                                → GetMyTickets
GET    /admin/tickets/:ticketId                         → GetTicketDetail
POST   /admin/tickets                                   → CreateTicket (ручное) { boardId, message, data }
POST   /admin/tickets/:ticketId/assign                  → AssignTicket
POST   /admin/tickets/:ticketId/reassign                → ReassignTicket { assigneeId }
POST   /admin/tickets/:ticketId/unassign                → UnassignTicket
POST   /admin/tickets/:ticketId/move                    → MoveTicket { toBoardId, comment }
POST   /admin/tickets/:ticketId/done                    → MarkDone
POST   /admin/tickets/:ticketId/reopen                  → ReopenTicket
POST   /admin/tickets/:ticketId/comments                → AddComment { text }
```

### Organization

```
# Те же эндпоинты под /organizations/:orgId/boards/...
# Фильтрация по organizationId, проверка OrganizationPermission
```

---

## Файловая структура

```
src/features/tickets/
  tickets.module.ts

  domain/
    aggregates/
      ticket/
        state.ts               # TicketState
        commands.ts
        events.ts
        errors.ts
        entity.ts              # Functional Decider
        entity.spec.ts
      board/
        state.ts               # BoardState
        commands.ts
        events.ts
        errors.ts
        entity.ts              # Делегирует sub-entities
        entity.spec.ts
        entities/
          board-subscription.entity.ts  # Sub-entity: тип + create, findByTrigger (id: BoardSubscriptionId)
          board-automation.entity.ts    # Sub-entity: тип + create, enable, disable, findEnabled (id: BoardAutomationId)
    vo/
      ticket-data.ts           # TicketData flat VO, TicketItemData, TicketOrganizationData
      triggers.ts              # TriggerId union, TRIGGER_META
      filters.ts               # FilterId unions, FILTER_META, TriggerFilters, SubscriptionFilter
      history.ts               # TicketHistoryEntry, TicketHistoryAction

  application/
    ports.ts                   # TicketRepository, BoardRepository, TicketQueryPort
    filter-context-port.ts     # ProgrammaticFilterContext (для first-time-org и т.д.)
    use-cases/
      tickets/
        create-ticket.interactor.ts
        assign-ticket.interactor.ts
        reassign-ticket.interactor.ts
        unassign-ticket.interactor.ts
        move-ticket.interactor.ts
        mark-done.interactor.ts
        reopen-ticket.interactor.ts
        add-comment.interactor.ts
      boards/
        create-board.interactor.ts
        update-board.interactor.ts
        delete-board.interactor.ts
        add-subscription.interactor.ts
        remove-subscription.interactor.ts
        add-member.interactor.ts
        remove-member.interactor.ts
        set-automation.interactor.ts
        disable-automation.interactor.ts
      automation/
        process-automation.handler.ts     # dispatch задачи в ai-agent через kernel-порт
      queries/
        get-tickets.query.ts
        get-ticket-detail.query.ts
        get-boards.query.ts
        get-my-tickets.query.ts
        get-triggers.query.ts

  adapters/
    http/
      platform-tickets.controller.ts
      platform-boards.controller.ts
      org-tickets.controller.ts
      org-boards.controller.ts
    db/
      schema.ts
      repositories/
        ticket.repository.ts
        board.repository.ts
      queries/
        ticket.query.ts
    kafka/
      ticket-creation.handler.ts          # триггер-события → тикеты
      ai-task-result.handler.ts           # AiTaskCompleted/Failed → применить к тикету
      consumer-ids.ts
    redis/
      trigger-counter.adapter.ts          # every-nth счётчик в Redis
      filter-context.adapter.ts           # ProgrammaticFilterContext impl
```

---

## Trigger → Ticket flow

```
Kafka event (item.moderation-requested)
  │
  ▼
TicketCreationKafkaHandler
  │ Парсит событие
  │ Заполняет TicketData (data.item = { id, title, ... })
  │ Генерирует message ('Модерация товара: {title}')
  │ Инкрементирует счётчик триггера в Redis
  │
  ▼
BoardRepository.findByTrigger('item.moderation-requested')
  │ Находит все доски, подписанные на этот триггер
  │
  ▼
Для каждой доски:
  │ Проверяет filters (json-logic + programmatic) против TicketData
  │ Если все фильтры прошли → CreateTicket { boardId, message, data, triggerId }
  │ (тикеты на разных досках — отдельные агрегаты)
  │
  ▼
Если у доски есть automation и тикет в статусе open:
  │ ProcessAutomationHandler
  │ Собирает AiContentBlock[] + resultSchema
  │ AiAgentDispatcher.dispatch() → агент принял задачу
  │
  ▼
AI-агент (async, отдельный модуль):
  │ LLM (structured output по resultSchema)
  │ Выполняет действия от своего UserId
  │ Публикует AiTaskCompleted / AiTaskFailed в Kafka
  │
  ▼
AiTaskResultKafkaHandler (в tickets):
  │ approved/rejected → Assign(agent) → Comment(reason) → MarkDone
  │ uncertain/error → Comment(reason) → оставляет open / Move
  │
  ▼
Если нет automation или uncertain:
  │ Тикет ждёт ручной обработки
  │ Оператор видит данные, переходит в нужный интерфейс, выполняет действие, закрывает тикет
```

---

## Порядок реализации

### Фаза 1 — Domain + Workflow
1. ✅ Domain: `TicketData` VO, `TriggerId` union, `TicketHistoryEntry` VO, `SubscriptionFilter` VO
2. ✅ Domain: Ticket aggregate (create, assign, reassign, unassign, move, done, reopen, comment) + unit tests
3. ✅ Domain: Board aggregate (create, update, subscribe, set members, automation) + unit tests
4. ✅ Domain: `BoardSubscriptionEntity` sub-entity (id: `BoardSubscriptionId`, тип inline, операции по id)
5. ✅ Domain: `BoardAutomationEntity` sub-entity (id: `BoardAutomationId`, тип inline, enable/disable, операции по id). `vo/automation.ts` удалён — тип живёт в entity
6. Kafka consumer: `item.moderation` / `org.moderation` → тикеты
7. Kernel: `AiAgentDispatcher` порт + `AiAgentId` + integration events
8. Feature `ai-agent`: агрегат Agent + CRUD + Claude adapter + стаб
9. ProcessAutomationHandler (dispatch в ai-agent) + AiTaskResultKafkaHandler (результат)
10. Seed: агент + две доски с автоматизацией
11. E2E: submit item → тикет → ai-agent → done

### Фаза 2 — Админка
12. HTTP: CRUD досок, подписки, members, автоматизация
13. HTTP: работа с тикетами (assign, reassign, move, comments)
14. HTTP: ручное создание тикетов
15. DB queries с фильтрацией

### Фаза 3 — Organization-контекст
16. Organization-scope доски и триггеры
17. HTTP контроллеры под /organizations/:orgId/

### Фаза 4 — Расширения
18. Новые поля в TicketData + триггеры (жалобы, обращения)
19. Кастомные статусы (если понадобится)
20. Уведомления операторам

# Feature: Тикет-система (Tickets)

## Концепция

Система заявок с типизированными тикетами:
- **Триггеры** — union в коде. Каждый триггер привязан к типу тикета и автоматически создаёт тикеты из бизнес-событий.
- **Типы тикетов** — discriminated union в коде. Каждый тип определяет свою структуру данных. Тикеты можно создавать и вручную.
- **Фильтры** — два вида: декларативные (json-logic по payload) и программные (хардкод со сложной логикой, например "каждый 10-й", "первая публикация организации"). Комбинируются на подписках досок.
- **Доски (Board)** — динамические, из админки. Подписываются на триггеры с фильтрами, назначают обработчиков, настраивают доступные действия и автоматизацию. Любой тикет можно перенаправить на любую доску (эскалация).
- **Действия (Actions)** — статический набор в коде. Какие действия доступны — определяется настройками доски + пермишенами роли пользователя. Если у оператора нет нужного действия — эскалирует на другую доску.

Ядро переиспользуется для двух контекстов:
- **Platform** — глобальные доски для админов (модерация, жалобы)
- **Organization** — доски внутри организации (обращения клиентов, задачи)

---

## Типы тикетов (discriminated union, в коде)

Тип тикета определяет структуру данных. Новый тип = новый member union'а + адаптеры.

```ts
// domain/ticket-data.ts

type TicketData =
  | ItemModerationData
  | OrganizationModerationData;
  // расширяется:
  // | ReviewComplaintData
  // | UserReportData
  // | CustomerRequestData (для org-контекста)

type ItemModerationData = {
  type: 'item-moderation';
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  title: string;
  description: string;
  imageUrl: string | null;
  categoryIds: CategoryId[];
};

type OrganizationModerationData = {
  type: 'org-moderation';
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarUrl: string | null;
};
```

`TicketData.type` — дискриминант. По нему определяется:
- Какие поля отображать в UI
- Какие действия потенциально доступны
- Как извлекать контент для LLM

---

## Триггеры (union, в коде)

Триггер связывает Kafka-событие с типом тикета. Статический набор.

```ts
// domain/triggers.ts

type TriggerId =
  | 'item.moderation-requested'
  | 'organization.moderation-requested';
  // расширяется:
  // | 'review.reported'
  // | 'user.reported'

// Маппинг триггер → тип данных тикета
type TriggerToData = {
  'item.moderation-requested': ItemModerationData;
  'organization.moderation-requested': OrganizationModerationData;
};

// Метаданные триггеров (для UI — справочник)
const TRIGGER_META: Record<TriggerId, { name: string; scope: 'platform' | 'organization' }> = {
  'item.moderation-requested': { name: 'Модерация товара', scope: 'platform' },
  'organization.moderation-requested': { name: 'Модерация организации', scope: 'platform' },
};
```

Добавление нового триггера:
1. Добавить member в `TriggerId`
2. Добавить тип данных в `TicketData` union
3. Добавить маппинг в `TriggerToData`
4. Написать `KafkaHandler` который конвертирует событие → `TicketData`
5. Написать `ActionExecutor` для действий этого типа

---

## Действия (Actions, в коде)

Набор всех возможных действий — статический union. Какие из них доступны на конкретной доске — настраивается в админке. Кто может выполнить — определяется пермишенами роли.

```ts
// domain/actions.ts

type ActionId =
  | 'moderation.approve-item'
  | 'moderation.reject-item'
  | 'moderation.approve-org'
  | 'moderation.reject-org';
  // расширяется:
  // | 'content.hide'
  // | 'user.ban'
  // | 'user.warn'

// Метаданные действий (для UI)
const ACTION_META: Record<ActionId, {
  label: string;
  permission: string;                // пермишен для выполнения
  applicableTo: TicketData['type'][]; // для каких типов тикетов применимо
}> = {
  'moderation.approve-item': {
    label: 'Одобрить публикацию',
    permission: 'tickets.moderate_items',
    applicableTo: ['item-moderation'],
  },
  'moderation.reject-item': {
    label: 'Отклонить',
    permission: 'tickets.moderate_items',
    applicableTo: ['item-moderation'],
  },
  'moderation.approve-org': {
    label: 'Одобрить профиль',
    permission: 'tickets.moderate_orgs',
    applicableTo: ['org-moderation'],
  },
  'moderation.reject-org': {
    label: 'Отклонить профиль',
    permission: 'tickets.moderate_orgs',
    applicableTo: ['org-moderation'],
  },
};
```

### Доступность действия для пользователя

Действие доступно если выполнены **все** условия:
1. Действие включено на доске (`board.enabledActionIds`)
2. У пользователя есть пермишен (`action.permission`) — через роль (глобальную или организационную)
3. Действие совместимо с данными тикета (executor сам проверяет: для `moderation.approve-item` нужен `itemId` в payload)

```ts
function getAvailableActions(
  board: BoardState,
  ticket: TicketState,
  userPermissions: string[],
): ActionMeta[] {
  return board.enabledActionIds
    .map(id => ACTION_META[id])
    .filter(action => userPermissions.includes(action.permission))
    .filter(action => action.applicableTo.includes(ticket.data.type));
}
```

Если список пуст — оператор видит только стандартные кнопки workflow (перенаправить, отказаться). Это и есть эскалация.

---

## Агрегат: Ticket

```ts
type TicketState = EntityState<{
  ticketId: TicketId;
  boardId: BoardId;

  // --- Данные (типизированные) ---
  data: TicketData;                         // discriminated union
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
  data: TicketData;
  triggerId: TriggerId | null;            // null = ручное создание
  now: Date;
};

type AssignTicketCommand = { type: 'AssignTicket'; assigneeId: UserId; now: Date };
type UnassignTicketCommand = { type: 'UnassignTicket'; now: Date };
type MoveTicketCommand = { type: 'MoveTicket'; toBoardId: BoardId; movedBy: UserId; now: Date };
type MarkDoneCommand = { type: 'MarkDone'; now: Date };
type ReopenTicketCommand = { type: 'ReopenTicket'; now: Date };
type CommentTicketCommand = { type: 'CommentTicket'; authorId: UserId | 'automation'; text: string; now: Date };
```

### Domain Rules

1. **CreateTicket (вручную)** — доска должна иметь `manualCreation: true`. Создатель должен быть member доски.
2. **Assign** — только `open` тикеты. Assignee должен быть member доски. Статус → `in-progress`.
3. **Unassign** — только `in-progress`. Статус → `open`.
4. **Move** — можно из любого статуса кроме `done`. Целевая доска должна быть в `allowedTransferBoardIds` текущей доски. Если список пуст — перенаправление запрещено.
5. **MarkDone** — только `in-progress` (тикет должен быть назначен).
6. **Reopen** — только `done`. Статус → `open`, assignee сбрасывается.

### История

```ts
type TicketHistoryEntry = {
  action: 'created' | 'assigned' | 'unassigned' | 'moved'
        | 'done' | 'reopened' | 'action-executed' | 'commented';
  actorId: UserId | 'automation';
  data: Record<string, unknown>;           // { fromBoardId, toBoardId } | { actionId } | { comment }
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

```ts
// domain/filters.ts

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

Доска — конфигурируемая очередь тикетов. Создаётся админом через UI. Любой тикет можно перенаправить на любую доску — ограничений по типу нет. Если у оператора нет нужного действия, он эскалирует тикет дальше.

```ts
type BoardState = EntityState<{
  boardId: BoardId;
  name: string;                             // 'Модерация товаров'
  description: string | null;
  scope: 'platform' | 'organization';
  organizationId: OrganizationId | null;    // если scope === 'organization'

  // --- Автоматическое создание тикетов ---
  subscriptions: BoardSubscription[];       // триггер + фильтры

  // --- Ручное создание ---
  manualCreation: boolean;                  // можно ли создавать тикеты вручную на этой доске

  // --- Какие действия доступны ---
  enabledActionIds: ActionId[];             // какие действия включены на этой доске

  // --- Маршрутизация (куда можно перенаправить) ---
  allowedTransferBoardIds: BoardId[];       // список досок для перенаправления
  // пустой = перенаправление запрещено

  // --- Обработчики ---
  memberIds: UserId[];

  // --- LLM автоматизация ---
  automation: BoardAutomation | null;

  createdAt: Date;
  updatedAt: Date;
}>;
```
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
  manualCreation: false,                    // только автоматически из триггера
  enabledActionIds: ['moderation.approve-item', 'moderation.reject-item'],
  allowedTransferBoardIds: ['manual-review-board', 'kids-review-board'],
  memberIds: [moderatorUserId],
  automation: { /* uncertain → move to manual-review-board */ },
}

// Доска "Ручная проверка" — сюда попадают спорные тикеты из LLM
{
  boardId: 'manual-review-board',
  name: 'Ручная проверка',
  scope: 'platform',
  subscriptions: [],                        // нет триггеров — только перенаправленные
  manualCreation: false,
  enabledActionIds: ['moderation.approve-item', 'moderation.reject-item'],
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
  manualCreation: true,                     // можно создать вручную (ручная проверка конкретного товара)
  enabledActionIds: ['moderation.approve-item', 'moderation.reject-item'],
  allowedTransferBoardIds: ['manual-review-board'],
  memberIds: [kidsSpecialistUserId],
  automation: null,
}

// Доска "Пост-модерация" — выборочная проверка уже одобренных
{
  boardId: 'post-moderation-board',
  name: 'Пост-модерация',
  scope: 'platform',
  subscriptions: [
    {
      triggerId: 'item.moderation-approved',
      filters: [
        { type: 'programmatic', filterId: 'every-nth', params: { n: 10 } },
      ],
    },
  ],
  manualCreation: false,
  enabledActionIds: ['moderation.reject-item'],
  allowedTransferBoardIds: ['manual-review-board'],
  memberIds: [qaUserId],
  automation: null,
}
```

Один триггер `item.moderation-requested` → тикет создаётся в обеих досках (если фильтр совпал).

---

## Ручное создание тикетов

Оператор может создать тикет вручную, если на доске `manualCreation: true`:
1. Выбрать доску (в которой он member и `manualCreation` включён)
2. Выбрать тип тикета (из всех `TicketData['type']`)
3. Заполнить данные по структуре выбранного типа

`triggerId` у таких тикетов = `null`.

**Когда `manualCreation: false`** — тикеты попадают на доску только автоматически (через триггеры) или через перенаправление с другой доски. Это защищает автоматизированные доски от "мусорных" тикетов.

---

## Стандартные кнопки тикета

У всех тикетов одинаковый workflow:

| Кнопка | Действие | Кто может |
|--------|----------|-----------|
| **Взять** | Назначить на себя → `in-progress` | Любой member доски |
| **Отказаться** | Убрать с себя → `open` | Текущий assignee |
| **Перенаправить** | Переместить на доску из `allowedTransferBoardIds` | Любой member доски |
| **Обработано** | → `done` | Текущий assignee |
| **Переоткрыть** | → `open` (из `done`) | Любой member доски |

**Действия над сущностями** (approve, reject и т.д.) — отдельные кнопки, определяемые `board.enabledActionIds` + пермишенами пользователя.

---

## Action Executors (в коде)

```ts
// application/action-executor-port.ts
abstract class ActionExecutor {
  abstract execute(actionId: ActionId, data: TicketData): Promise<void>;
}

// adapters/actions/moderation-action.executor.ts
@Injectable()
class ModerationActionExecutor implements ActionExecutor {
  constructor(private readonly producer: KafkaProducerService) {}

  async execute(actionId: ActionId, data: TicketData): Promise<void> {
    switch (actionId) {
      case 'moderation.approve-item': {
        const d = data as ItemModerationData;
        this.producer.send(moderationResultsContract, {
          id: crypto.randomUUID(),
          type: 'moderation.approved',
          entityType: 'item',
          entityId: d.itemId,
        });
        break;
      }
      case 'moderation.reject-item': {
        const d = data as ItemModerationData;
        this.producer.send(moderationResultsContract, {
          id: crypto.randomUUID(),
          type: 'moderation.rejected',
          entityType: 'item',
          entityId: d.itemId,
        });
        break;
      }
      case 'moderation.approve-org': {
        const d = data as OrganizationModerationData;
        this.producer.send(moderationResultsContract, {
          id: crypto.randomUUID(),
          type: 'moderation.approved',
          entityType: 'organization',
          entityId: d.organizationId,
        });
        break;
      }
      case 'moderation.reject-org': {
        const d = data as OrganizationModerationData;
        this.producer.send(moderationResultsContract, {
          id: crypto.randomUUID(),
          type: 'moderation.rejected',
          entityType: 'organization',
          entityId: d.organizationId,
        });
        break;
      }
    }
  }
}
```

Organization feature уже слушает `moderation.results` — ничего менять не надо.

---

## LLM-автоматизация

Привязывается к доске. Работает как пользователь с пермишенами.

```ts
type BoardAutomation = {
  enabled: boolean;
  provider: 'claude';
  model: string;                           // 'claude-haiku-4-5-20251001'
  systemPrompt: string;                    // настраиваемый промпт
  userId: UserId;                          // "пользователь-бот" с пермишенами
  onApprove: {
    actionId: ActionId;                    // 'moderation.approve-item'
    thenStatus: 'done';
  };
  onReject: {
    actionId: ActionId;
    thenStatus: 'done';
  };
  onUncertain: {
    thenStatus: 'open';                    // оставить для ручной обработки
    moveToBoardId: BoardId | null;         // или перенаправить на другую доску
  };
};
```

### Flow автоматизации

1. Тикет создаётся на доске с автоматизацией
2. `ProcessAutomationHandler` извлекает контент из `ticket.data` (текст + картинки по типу)
3. Отправляет в Claude с `automation.systemPrompt`
4. `approved` → проверяет пермишен бота → выполняет action → `done`
5. `rejected` → проверяет пермишен бота → выполняет action → `done`
6. `uncertain` / ошибка → оставляет `open` или перенаправляет на другую доску
7. Всё в `history` с actorId бота

### Извлечение контента для LLM (по типу тикета)

```ts
// application/content-extractor.ts

type ModerationContent = {
  texts: { label: string; value: string }[];
  imageUrls: string[];
};

function extractContent(data: TicketData): ModerationContent {
  switch (data.type) {
    case 'item-moderation':
      return {
        texts: [
          { label: 'Название', value: data.title },
          { label: 'Описание', value: data.description },
        ],
        imageUrls: data.imageUrl ? [data.imageUrl] : [],
      };
    case 'org-moderation':
      return {
        texts: [
          { label: 'Название организации', value: data.name },
          { label: 'Описание', value: data.description },
        ],
        imageUrls: data.avatarUrl ? [data.avatarUrl] : [],
      };
  }
}
```

Новый тип тикета = новый case в `extractContent`.

---

## Два контекста: Platform и Organization

Ядро одно, но разные ограничения:

| | Platform | Organization |
|---|---------|-------------|
| Кто создаёт доски | Глобальные админы | Сотрудники с пермишеном `manage_tickets` |
| Триггеры | `scope: 'platform'` | `scope: 'organization'` |
| Members | Глобальные пользователи | Сотрудники организации |
| Пермишены действий | `Permissions` (глобальные) | `OrganizationPermission` |
| Доступ | `/admin/...` | `/organizations/:orgId/...` |

Для org-контекста `BoardState.organizationId` задаёт изоляцию.

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

# Действия доски
PUT    /admin/boards/:boardId/actions                   → SetEnabledActions { actionIds[] }

# Автоматизация
PUT    /admin/boards/:boardId/automation                → SetAutomation { model, prompt, ... }
DELETE /admin/boards/:boardId/automation                → DisableAutomation

# Справочники (readonly)
GET    /admin/ticket-triggers                           → GetTriggers (scope: platform)
GET    /admin/ticket-actions                            → GetActions
GET    /admin/ticket-types                              → GetTicketTypes

# Тикеты
GET    /admin/tickets?boardId=&status=&assigneeId=      → GetTickets
GET    /admin/tickets/my                                → GetMyTickets
GET    /admin/tickets/:ticketId                         → GetTicketDetail
POST   /admin/tickets                                   → CreateTicket (ручное) { boardId, data }
POST   /admin/tickets/:ticketId/assign                  → AssignTicket
POST   /admin/tickets/:ticketId/unassign                → UnassignTicket
POST   /admin/tickets/:ticketId/move                    → MoveTicket { toBoardId }
POST   /admin/tickets/:ticketId/done                    → MarkDone
POST   /admin/tickets/:ticketId/reopen                  → ReopenTicket
POST   /admin/tickets/:ticketId/actions/:actionId       → ExecuteAction
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
  SPEC.md
  tickets.module.ts

  domain/
    aggregates/
      ticket/
        state.ts               # TicketState
        commands.ts
        events.ts
        errors.ts
        entity.ts              # Functional Decider
        entity.test.ts
      board/
        state.ts               # BoardState, BoardSubscription, BoardAutomation
        commands.ts
        events.ts
        entity.ts
    ticket-data.ts             # TicketData discriminated union
    triggers.ts                # TriggerId union, TRIGGER_META, TriggerToData
    actions.ts                 # ActionId union, ACTION_META

  application/
    ports.ts                   # TicketRepository, BoardRepository, TicketQueryPort
    llm-port.ts                # LlmModerationPort
    action-executor-port.ts    # ActionExecutor
    content-extractor.ts       # TicketData → ModerationContent (по типу)
    use-cases/
      tickets/
        create-ticket.interactor.ts
        assign-ticket.interactor.ts
        unassign-ticket.interactor.ts
        move-ticket.interactor.ts
        mark-done.interactor.ts
        reopen-ticket.interactor.ts
        execute-action.interactor.ts       # проверяет доску + пермишен
        add-comment.interactor.ts
      boards/
        create-board.interactor.ts
        update-board.interactor.ts
        delete-board.interactor.ts
        add-subscription.interactor.ts
        remove-subscription.interactor.ts
        add-member.interactor.ts
        remove-member.interactor.ts
        set-enabled-actions.interactor.ts
        set-automation.interactor.ts
        disable-automation.interactor.ts
      automation/
        process-automation.handler.ts
      queries/
        get-tickets.query.ts
        get-ticket-detail.query.ts
        get-boards.query.ts
        get-my-tickets.query.ts
        get-triggers.query.ts
        get-actions.query.ts

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
      consumer-ids.ts
    claude/
      claude-moderation.adapter.ts
      stub-moderation.adapter.ts
    actions/
      moderation-action.executor.ts       # moderation.results → Kafka
```

---

## Trigger → Ticket flow

```
Kafka event (item.moderation-requested)
  │
  ▼
TicketCreationKafkaHandler
  │ Парсит событие
  │ Конвертирует в ItemModerationData (обогащает: imageId → URL)
  │
  ▼
BoardRepository.findByTrigger('item.moderation-requested')
  │ Находит все доски, подписанные на этот триггер
  │
  ▼
Для каждой доски:
  │ Проверяет filter (json-logic) против TicketData
  │ Если совпадает → CreateTicket { boardId, data, triggerId }
  │
  ▼
Если у доски есть automation:
  │ ProcessAutomationHandler
  │ extractContent(data) → текст + картинки
  │ Claude API с промптом из automation.systemPrompt
  │ approved → ExecuteAction(automation.onApprove.actionId) + MarkDone
  │ rejected → ExecuteAction(automation.onReject.actionId) + MarkDone
  │ uncertain → оставляет open / перенаправляет
  │
  ▼
Если нет automation или uncertain:
  │ Тикет ждёт ручной обработки
```

---

## Порядок реализации

### Фаза 1 — Работающая модерация
1. Domain: `TicketData` union + `TriggerId` union + `ActionId` union
2. Domain: Ticket aggregate (create, assign, unassign, move, done, reopen)
3. Domain: Board aggregate (create, subscribe, set actions, set members)
4. Kafka consumer: `item.moderation` / `org.moderation` → тикеты
5. ActionExecutor: moderation.approve/reject → Kafka `moderation.results`
6. LLM port + Claude adapter + стаб
7. ProcessAutomationHandler
8. Seed: две доски с автоматизацией
9. E2E: submit item → тикет → LLM → published

### Фаза 2 — Админка
10. HTTP: CRUD досок, подписки, members, actions, автоматизация
11. HTTP: работа с тикетами (assign, move, execute action, comments)
12. HTTP: ручное создание тикетов
13. DB queries с фильтрацией

### Фаза 3 — Organization-контекст
14. Organization-scope доски и триггеры
15. HTTP контроллеры под /organizations/:orgId/

### Фаза 4 — Расширения
16. Новые типы тикетов + триггеры (жалобы, обращения)
17. Кастомные статусы (если понадобится)
18. Уведомления операторам

# Ticket System — Implementation Tasks

Каждая задача — отдельный plan mode. Задачи выполняются последовательно, каждая опирается на результат предыдущей.

Перед каждой задачей читай:
- `plans/ticket-system.md` — спецификация
- `architecture/` — документация по архитектуре (1-domain, 2-application, 3-adapters, 4-infra, 5-kernel)
- Указанные файлы-образцы из существующих фич

---

## Phase 1 — Domain Layer

### Task 1.1 — Kernel IDs + TicketData union + Triggers + Actions + Filters

**Цель**: Создать все доменные типы данных тикет-системы.

**Контекст для чтения**:
- `architecture/1-domain.md` — паттерны домена
- `src/kernel/domain/ids.ts` — существующие ID (добавить TicketId, BoardId)
- `src/features/organization/domain/aggregates/organization/events.ts` — пример event union

**Что сделать**:
1. Добавить `TicketId`, `BoardId` в `src/kernel/domain/ids.ts`
2. Создать `src/features/tickets/domain/ticket-data.ts` — `TicketData` discriminated union (`ItemModerationData`, `OrganizationModerationData`)
3. Создать `src/features/tickets/domain/triggers.ts` — `TriggerId` union, `TriggerToData` mapping, `TRIGGER_META`
4. Создать `src/features/tickets/domain/actions.ts` — `ActionId` union, `ACTION_META` с permission и applicableTo
5. Создать `src/features/tickets/domain/filters.ts` — `UniversalFilterId`, `OrgFilterId`, `ItemFilterId`, `TriggerFilters`, `FILTER_META`, `SubscriptionFilter`, `BoardSubscription`

**Результат**: Все статические типы и метаданные на месте. Нет зависимостей кроме kernel/ids.

---

### Task 1.2 — Ticket Aggregate (Decide + Apply)

**Цель**: Реализовать агрегат Ticket с functional decider pattern.

**Контекст для чтения**:
- `architecture/1-domain.md` — Decide+Apply, sub-entities, EntityState
- `src/features/organization/domain/aggregates/organization/entity.ts` — образец агрегата
- `src/features/organization/domain/aggregates/organization/commands.ts` — образец команд
- `src/features/organization/domain/aggregates/organization/events.ts` — образец событий
- `src/infra/ddd/error.ts` — `CreateDomainError`
- Результат Task 1.1 — `src/features/tickets/domain/ticket-data.ts`, `triggers.ts`, `actions.ts`

**Что сделать**:
1. Создать `src/features/tickets/domain/aggregates/ticket/state.ts` — `TicketState` (ticketId, boardId, data, triggerId, status, assigneeId, history, createdAt, updatedAt)
2. Создать `src/features/tickets/domain/aggregates/ticket/commands.ts` — CreateTicket, AssignTicket, ReassignTicket, UnassignTicket, MoveTicket, MarkDone, ReopenTicket, CommentTicket, ExecuteActionOnTicket
3. Создать `src/features/tickets/domain/aggregates/ticket/events.ts` — TicketEvent discriminated union
4. Создать `src/features/tickets/domain/aggregates/ticket/errors.ts` — TicketNotFoundError, InvalidTicketStatusError, NotBoardMemberError, TransferNotAllowedError, MoveCommentRequiredError и т.д.
5. Создать `src/features/tickets/domain/aggregates/ticket/entity.ts` — `TicketEntity` object с методами create, assign, reassign, unassign, move, markDone, reopen, comment, recordAction. Каждый метод возвращает `Either<Error, { state, event }>`.

**Domain Rules из спеки**:
- Assign — только `open`, assignee must be board member, status → `in-progress`
- Reassign — только `in-progress`, требует спец. пермишен (проверка на уровне application)
- Unassign — только `in-progress`, status → `open`
- Move — любой статус кроме `done`, toBoardId must be in allowedTransferBoardIds, комментарий обязателен
- MarkDone — только `in-progress`
- Reopen — только `done`, status → `open`, assignee сбрасывается
- ExecuteActionOnTicket — записывает action в history (сам side-effect — в application layer)

**Результат**: Полностью работающий Ticket aggregate с unit тестами.

---

### Task 1.3 — Board Aggregate

**Цель**: Реализовать агрегат Board.

**Контекст для чтения**:
- `architecture/1-domain.md`
- `src/features/tickets/domain/aggregates/ticket/entity.ts` — уже созданный Ticket (для понимания стиля)
- `src/features/tickets/domain/filters.ts` — BoardSubscription type
- `src/features/tickets/domain/actions.ts` — ActionId

**Что сделать**:
1. Создать `src/features/tickets/domain/aggregates/board/state.ts` — `BoardState` (boardId, name, description, scope, organizationId, subscriptions, manualCreation, enabledActionIds, allowedTransferBoardIds, memberIds, automation, createdAt, updatedAt)
2. Создать `src/features/tickets/domain/aggregates/board/commands.ts` — CreateBoard, UpdateBoard, DeleteBoard, AddSubscription, RemoveSubscription, AddMember, RemoveMember, SetEnabledActions, SetAutomation, DisableAutomation
3. Создать `src/features/tickets/domain/aggregates/board/events.ts`
4. Создать `src/features/tickets/domain/aggregates/board/errors.ts`
5. Создать `src/features/tickets/domain/aggregates/board/entity.ts` — `BoardEntity` object

**Domain Rules**:
- AddSubscription — проверить что triggerId валиден
- SetEnabledActions — проверить что actionIds существуют в ACTION_META
- Members — массив UserId[]

**Результат**: Board aggregate с unit тестами.

---

## Phase 2 — Application Layer (Ports + Write Use Cases)

### Task 2.1 — Ports Definition

**Цель**: Определить все порты (абстрактные классы) для тикет-системы.

**Контекст для чтения**:
- `architecture/2-application.md` — порты, interactors, handlers
- `src/features/organization/application/ports.ts` — образец портов
- `src/kernel/application/ports/tx-host.ts` — Transaction type
- Результат Tasks 1.2, 1.3 — state типы агрегатов

**Что сделать**:
1. Создать `src/features/tickets/application/ports.ts`:
   - `TicketRepository` — findById(tx, ticketId), save(tx, state)
   - `BoardRepository` — findById(tx, boardId), findByTrigger(tx, triggerId), save(tx, state), delete(tx, boardId)
   - `TicketQueryPort` — findTickets(filters), findTicketDetail(ticketId), findMyTickets(userId), findBoardTicketCounts(boardId)
   - `BoardQueryPort` — findBoards(scope, orgId?), findBoardDetail(boardId)
2. Создать `src/features/tickets/application/action-executor-port.ts`:
   - `ActionExecutor` — execute(actionId, data): Promise<Either<Error, void>>
3. Создать `src/features/tickets/application/llm-port.ts`:
   - `LlmModerationPort` — moderate(content, systemPrompt): Promise<LlmDecision>
   - `LlmDecision` = { result: 'approved' | 'rejected' | 'uncertain'; reason: string }
4. Создать `src/features/tickets/application/filter-context-port.ts`:
   - `ProgrammaticFilterContext` — isFirstTimeOrg(orgId): Promise<boolean>, getOrgRejectionCount(orgId): Promise<number>
5. Создать `src/features/tickets/application/trigger-counter-port.ts`:
   - `TriggerCounterPort` — increment(triggerId): Promise<number>
6. Создать `src/features/tickets/application/content-extractor.ts` — extractContent(data): ModerationContent (pure function, switch по data.type)

**Результат**: Все порты определены. Нет реализаций.

---

### Task 2.2 — Ticket Write Interactors

**Цель**: Реализовать use cases для работы с тикетами.

**Контекст для чтения**:
- `architecture/2-application.md`
- `src/features/organization/application/use-cases/manage-org/create-organization.interactor.ts` — образец
- `src/features/tickets/application/ports.ts` — порты (Task 2.1)
- `src/features/tickets/domain/aggregates/ticket/entity.ts` — агрегат (Task 1.2)
- `src/kernel/application/ports/permission.ts` — PermissionCheckService

**Что сделать** (каждый interactor — отдельный файл в `src/features/tickets/application/use-cases/tickets/`):
1. `create-ticket.interactor.ts` — ручное создание. Проверяет: пермишен, board.manualCreation, user is board member. Вызывает TicketEntity.create.
2. `assign-ticket.interactor.ts` — взять тикет на себя. Проверяет: user is board member.
3. `reassign-ticket.interactor.ts` — переназначить. Проверяет: спец. пермишен `tickets.reassign`.
4. `unassign-ticket.interactor.ts` — отказаться. Проверяет: текущий assignee === userId.
5. `move-ticket.interactor.ts` — перенаправить. Проверяет: user is board member, загружает обе доски, проверяет allowedTransferBoardIds.
6. `mark-done.interactor.ts` — обработано. Проверяет: текущий assignee === userId.
7. `reopen-ticket.interactor.ts` — переоткрыть. Проверяет: user is board member.
8. `execute-action.interactor.ts` — выполнить действие. Проверяет: action включён на доске, пермишен пользователя, вызывает ActionExecutor, записывает в history.
9. `add-comment.interactor.ts` — комментарий. Проверяет: user is board member.

**Результат**: Все write use cases для тикетов.

---

### Task 2.3 — Board Write Interactors

**Цель**: Реализовать use cases для управления досками.

**Контекст для чтения**:
- `src/features/tickets/application/use-cases/tickets/` — стиль из Task 2.2
- `src/features/tickets/domain/aggregates/board/entity.ts` — агрегат (Task 1.3)
- `src/features/tickets/application/ports.ts` — порты

**Что сделать** (в `src/features/tickets/application/use-cases/boards/`):
1. `create-board.interactor.ts` — пермишен `tickets.manage_boards`
2. `update-board.interactor.ts`
3. `delete-board.interactor.ts`
4. `add-subscription.interactor.ts` — проверяет triggerId scope
5. `remove-subscription.interactor.ts`
6. `add-member.interactor.ts`
7. `remove-member.interactor.ts`
8. `set-enabled-actions.interactor.ts`
9. `set-automation.interactor.ts`
10. `disable-automation.interactor.ts`

**Результат**: Все write use cases для досок.

---

### Task 2.4 — Ticket Creation Handler (Trigger → Ticket)

**Цель**: Реализовать handler который по Kafka-событию создаёт тикеты на подписанных досках.

**Контекст для чтения**:
- `architecture/2-application.md` — handlers
- `src/features/organization/application/use-cases/manage-items/approve-item-moderation.handler.ts` — образец handler
- `src/features/tickets/application/ports.ts` — BoardRepository.findByTrigger, TriggerCounterPort
- `src/features/tickets/domain/filters.ts` — SubscriptionFilter, json-logic

**Что сделать**:
1. Создать `src/features/tickets/application/use-cases/trigger/process-trigger.handler.ts`:
   - Получает triggerId + TicketData
   - Инкрементирует счётчик триггера (TriggerCounterPort)
   - Загружает все доски подписанные на этот триггер
   - Для каждой доски: проверяет фильтры (json-logic + programmatic)
   - Если фильтры пройдены — создаёт тикет через TicketEntity.create + save
   - Возвращает список созданных ticketId
2. Создать `src/features/tickets/application/use-cases/trigger/evaluate-filters.ts` — чистая функция проверки фильтров (json-logic-js + programmatic switch)

**Результат**: Core handler для trigger → ticket flow.

---

### Task 2.5 — LLM Automation Handler

**Цель**: Реализовать handler автоматической обработки тикетов через LLM.

**Контекст для чтения**:
- `src/features/tickets/application/use-cases/trigger/process-trigger.handler.ts` — Task 2.4 (вызывает automation после создания)
- `src/features/tickets/application/content-extractor.ts` — извлечение контента
- `src/features/tickets/application/llm-port.ts` — LlmModerationPort
- `src/features/tickets/application/action-executor-port.ts` — ActionExecutor
- `plans/ticket-system.md` — секция "LLM-автоматизация"

**Что сделать**:
1. Создать `src/features/tickets/application/use-cases/automation/process-automation.handler.ts`:
   - Получает ticketId + boardId
   - Загружает тикет, проверяет status === 'open'
   - Загружает board, проверяет automation !== null && automation.enabled
   - Извлекает контент через extractContent(ticket.data)
   - Отправляет в LLM через LlmModerationPort
   - approved: Assign(bot) → ExecuteAction(onApprove.actionId) → Comment(reason) → MarkDone
   - rejected: Assign(bot) → ExecuteAction(onReject.actionId) → Comment(reason) → MarkDone
   - uncertain/error: Comment(reason) → Move(onUncertain.moveToBoardId) или оставить open
   - Всё через TicketEntity методы + save

**Результат**: Полный flow автоматизации.

---

### Task 2.6 — Query Use Cases

**Цель**: Реализовать read use cases.

**Контекст для чтения**:
- `src/features/tickets/application/ports.ts` — TicketQueryPort, BoardQueryPort

**Что сделать** (в `src/features/tickets/application/use-cases/queries/`):
1. `get-tickets.query.ts` — фильтрация по boardId, status, assigneeId
2. `get-ticket-detail.query.ts` — деталь тикета с историей
3. `get-my-tickets.query.ts` — тикеты назначенные на текущего пользователя
4. `get-boards.query.ts` — список досок (scope + orgId filter)
5. `get-triggers.query.ts` — возвращает TRIGGER_META (статический справочник)
6. `get-actions.query.ts` — возвращает ACTION_META (статический справочник)

**Результат**: Все read use cases.

---

## Phase 3 — Adapters Layer

### Task 3.1 — DB Schema + DatabaseClient

**Цель**: Создать Drizzle-схему и DatabaseClient для тикет-системы.

**Контекст для чтения**:
- `architecture/3-adapters.md` — DB адаптеры
- `src/features/organization/adapters/db/schema.ts` — образец схемы
- `src/infra/lib/nest-drizzle/create-database-client.ts` — CreateDatabaseClient
- `src/apps/db.module.ts` — регистрация клиентов

**Что сделать**:
1. Создать `src/features/tickets/adapters/db/schema.ts`:
   - Таблица `tickets` (id uuid PK, board_id text, state jsonb, created_at, updated_at)
   - Таблица `boards` (id uuid PK, scope text, organization_id text nullable, state jsonb, created_at, updated_at)
   - Индексы: tickets.board_id, tickets.updated_at, boards.scope+organization_id
2. Создать `TicketsDatabaseClient` через `CreateDatabaseClient(schema)`
3. Зарегистрировать `TicketsDatabaseClient` в `src/apps/db.module.ts`
4. Удалить папку `drizzle/` и сгенерировать миграцию заново (`npx drizzle-kit generate`)

**Результат**: DB-схема готова, миграция сгенерирована.

---

### Task 3.2 — Repository + Query Adapters

**Цель**: Реализовать DB-адаптеры для портов.

**Контекст для чтения**:
- `src/features/organization/adapters/db/repositories/organization.repository.ts` — образец
- `src/features/organization/adapters/db/queries/organization.query.ts` — образец query
- `src/features/tickets/application/ports.ts` — порты для реализации
- `src/features/tickets/adapters/db/schema.ts` — Task 3.1

**Что сделать**:
1. Создать `src/features/tickets/adapters/db/repositories/ticket.repository.ts` — implements TicketRepository (findById, save — upsert в jsonb)
2. Создать `src/features/tickets/adapters/db/repositories/board.repository.ts` — implements BoardRepository (findById, findByTrigger, save, delete)
3. Создать `src/features/tickets/adapters/db/queries/ticket.query.ts` — implements TicketQueryPort (SQL queries с фильтрацией по jsonb полям)
4. Создать `src/features/tickets/adapters/db/queries/board.query.ts` — implements BoardQueryPort

**Результат**: Все DB-адаптеры.

---

### Task 3.3 — Kafka Contracts + Ticket Creation Kafka Handler

**Цель**: Создать Kafka-контракты и handler для создания тикетов из событий.

**Контекст для чтения**:
- `src/infra/kafka-contracts/` — существующие контракты (item.contract.ts, moderation-results.contract.ts)
- `src/features/organization/adapters/kafka/handlers/moderation-results.handler.ts` — образец Kafka handler
- `src/infra/lib/nest-kafka/consumer/handler/decorators.ts` — @KafkaConsumerHandlers, @ContractHandler
- `src/features/tickets/application/use-cases/trigger/process-trigger.handler.ts` — Task 2.4

**Что сделать**:
1. Создать `src/infra/kafka-contracts/ticket-trigger.contract.ts` — контракт для item.moderation-requested и org.moderation-requested (или reuse существующих контрактов)
2. Создать consumer ID: `src/features/tickets/adapters/kafka/consumer-ids.ts` — `TICKETS_CONSUMER_ID`
3. Создать `src/features/tickets/adapters/kafka/ticket-creation.handler.ts`:
   - `@KafkaConsumerHandlers(TICKETS_CONSUMER_ID)`
   - `@ContractHandler(itemModerationContract)` — конвертирует Kafka message → ItemModerationData, вызывает ProcessTriggerHandler
   - `@ContractHandler(orgModerationContract)` — аналогично для OrganizationModerationData
4. Зарегистрировать `KafkaConsumerModule` для `TICKETS_CONSUMER_ID` в `src/apps/app.module.ts`

**Результат**: Kafka events → тикеты на досках.

---

### Task 3.4 — Action Executor Adapter + Moderation Results

**Цель**: Реализовать ActionExecutor который отправляет результаты модерации в Kafka.

**Контекст для чтения**:
- `src/infra/kafka-contracts/moderation-results.contract.ts` — существующий контракт
- `src/features/tickets/application/action-executor-port.ts` — порт
- `plans/ticket-system.md` — секция "Action Executors"

**Что сделать**:
1. Создать `src/features/tickets/adapters/actions/moderation-action.executor.ts`:
   - `@Injectable()`, implements ActionExecutor
   - Inject `KafkaProducerService`
   - switch по actionId: approve-item, reject-item, approve-org, reject-org → send moderationResultsContract
2. Если контракт `moderation-results` ещё не существует — создать в `src/infra/kafka-contracts/`

**Результат**: Действия модерации отправляют результаты через Kafka.

---

### Task 3.5 — LLM Adapter (Claude + Stub)

**Цель**: Реализовать адаптер для Claude API и стаб для тестов.

**Контекст для чтения**:
- `src/features/tickets/application/llm-port.ts` — порт LlmModerationPort
- `src/features/tickets/application/content-extractor.ts` — ModerationContent type
- `plans/ticket-system.md` — секция "LLM-автоматизация"

**Что сделать**:
1. Создать `src/features/tickets/adapters/claude/claude-moderation.adapter.ts`:
   - implements LlmModerationPort
   - Использует Anthropic SDK
   - Формирует prompt из ModerationContent + systemPrompt
   - Парсит ответ в LlmDecision (approved/rejected/uncertain + reason)
   - При ошибке API → { result: 'uncertain', reason: error message }
2. Создать `src/features/tickets/adapters/claude/stub-moderation.adapter.ts`:
   - implements LlmModerationPort
   - Всегда возвращает { result: 'approved', reason: 'auto-approved by stub' }

**Результат**: LLM адаптер для production и тестов.

---

### Task 3.6 — Redis Adapters (Trigger Counter + Filter Context)

**Цель**: Реализовать Redis-адаптеры для программных фильтров.

**Контекст для чтения**:
- `src/features/tickets/application/trigger-counter-port.ts` — порт счётчика
- `src/features/tickets/application/filter-context-port.ts` — порт контекста фильтров
- `src/infra/lib/nest-redis/` — Redis infrastructure (если есть)

**Что сделать**:
1. Создать `src/features/tickets/adapters/redis/trigger-counter.adapter.ts`:
   - implements TriggerCounterPort
   - Redis INCR на ключе `trigger-counter:{triggerId}`
2. Создать `src/features/tickets/adapters/redis/filter-context.adapter.ts`:
   - implements ProgrammaticFilterContext (stub: isFirstTimeOrg → false, getOrgRejectionCount → 0). Реальная логика — в Phase 4.

**Результат**: Redis-адаптеры для программных фильтров.

---

### Task 3.7 — HTTP Controllers (Platform Tickets + Boards)

**Цель**: Создать HTTP-контроллеры для platform-контекста.

**Контекст для чтения**:
- `architecture/3-adapters.md` — HTTP контроллеры
- `src/features/organization/adapters/http/organizations.controller.ts` — образец
- `src/features/tickets/application/use-cases/` — все interactors
- `plans/ticket-system.md` — секция "HTTP API"
- `http-contracts` — для типов request/response (если используется)

**Что сделать**:
1. Создать `src/features/tickets/adapters/http/platform-boards.controller.ts`:
   - `@Controller('admin/boards')`
   - CRUD: GET /, POST /, PATCH /:boardId, DELETE /:boardId
   - Subscriptions: POST /:boardId/subscriptions, DELETE /:boardId/subscriptions/:subId
   - Members: POST /:boardId/members, DELETE /:boardId/members/:userId
   - Actions: PUT /:boardId/actions
   - Automation: PUT /:boardId/automation, DELETE /:boardId/automation
2. Создать `src/features/tickets/adapters/http/platform-tickets.controller.ts`:
   - `@Controller('admin/tickets')`
   - GET /?boardId&status&assigneeId, GET /my, GET /:ticketId
   - POST / (ручное создание)
   - POST /:ticketId/assign, /reassign, /unassign, /move, /done, /reopen
   - POST /:ticketId/actions/:actionId
   - POST /:ticketId/comments
3. Создать `src/features/tickets/adapters/http/ticket-references.controller.ts`:
   - `@Controller('admin')`
   - GET /ticket-triggers, GET /ticket-actions, GET /ticket-types

**Результат**: Полный HTTP API для platform-контекста.

---

## Phase 4 — Wiring + Integration

### Task 4.1 — Module Registration + Permissions

**Цель**: Создать tickets.module.ts и зарегистрировать всё в app.module.ts.

**Контекст для чтения**:
- `src/features/organization/organization.module.ts` — образец модуля
- `src/apps/app.module.ts` — регистрация модулей
- `src/kernel/domain/permissions.ts` — существующие пермишены
- Все файлы из Tasks 2.x (interactors) и 3.x (adapters)

**Что сделать**:
1. Добавить пермишены в `src/kernel/domain/permissions.ts`:
   - `tickets.manage_boards` (boolean)
   - `tickets.moderate_items` (boolean)
   - `tickets.moderate_orgs` (boolean)
   - `tickets.reassign` (boolean)
   - `tickets.view_org_boards` (boolean)
2. Создать `src/features/tickets/tickets.module.ts`:
   - controllers: PlatformBoardsController, PlatformTicketsController, TicketReferencesController
   - providers: все interactors, handlers, port→adapter bindings
   - { provide: TicketRepository, useClass: DrizzleTicketRepository }
   - { provide: BoardRepository, useClass: DrizzleBoardRepository }
   - { provide: TicketQueryPort, useClass: DrizzleTicketQuery }
   - { provide: BoardQueryPort, useClass: DrizzleBoardQuery }
   - { provide: ActionExecutor, useClass: ModerationActionExecutor }
   - { provide: LlmModerationPort, useClass: StubModerationAdapter } (сначала стаб)
   - { provide: TriggerCounterPort, useClass: RedisTriggerCounter }
   - { provide: ProgrammaticFilterContext, useClass: RedisFilterContext }
3. Зарегистрировать `TicketsModule` в `src/apps/app.module.ts`
4. Удалить папку `drizzle/` и сгенерировать миграцию заново

**Результат**: Приложение компилируется, все DI-токены разрешены.

---

### Task 4.2 — Board Seed + Manual Smoke Test

**Цель**: Создать seed-данные для двух досок и проверить flow вручную.

**Контекст для чтения**:
- `plans/ticket-system.md` — примеры конфигурации досок
- `src/features/tickets/adapters/db/schema.ts` — DB schema

**Что сделать**:
1. Создать seed-скрипт или startup hook который создаёт 2 доски:
   - "Модерация товаров" — подписка на `item.moderation-requested`, automation: stub LLM
   - "Ручная проверка" — без подписок, только перенаправленные
2. Проверить что приложение стартует без ошибок
3. Проверить HTTP API вручную (curl/httpie): GET /admin/boards, GET /admin/ticket-triggers

**Результат**: Два seed-доски в базе, API отвечает.

---

### Task 4.3 — E2E Test: Submit Item → Ticket → Approved

**Цель**: Написать E2E тест полного flow.

**Контекст для чтения**:
- `architecture/6-test.md` — документация e2e тестов
- `src/test/e2e/` — существующие e2e тесты (образцы)
- `vitest.config.e2e.ts` — конфигурация
- Весь tickets feature

**Что сделать**:
1. Создать `src/test/e2e/features/tickets/ticket-moderation.e2e-spec.ts`:
   - Setup: создать board с подпиской на item.moderation-requested
   - Test 1: отправить item.moderation-requested event → тикет создан на доске
   - Test 2: assign тикет → execute action (approve) → mark done
   - Test 3: тикет с automation (stub LLM) → автоматически approved + done
   - Test 4: move тикет на другую доску → проверить boardId изменился
   - Test 5: reopen done тикет

**Результат**: E2E тесты проходят, flow работает end-to-end.

---

## Phase 5 — Organization Context (отложено)

### Task 5.1 — Org-scoped Controllers + Isolation

Добавить контроллеры под `/organizations/:orgId/boards/...` с проверкой OrganizationPermission и фильтрацией по organizationId.

### Task 5.2 — Platform Admin View Org Boards

Добавить пермишен `tickets.view_org_boards` и endpoint для просмотра org-досок платформенным админом.

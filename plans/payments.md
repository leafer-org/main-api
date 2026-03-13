# План реализации модуля платежей и подписок

## Лучшие практики

### 1. Payment Gateway Abstraction
- **Никогда не привязываться к одному провайдеру.** Платёжный шлюз — это порт (abstract class), адаптеры реализуют конкретные провайдеры (YooKassa, Stripe, Tinkoff и т.д.)
- Хранить `gatewayId` + `externalPaymentId` в каждой транзакции — для reconciliation

### 2. Idempotency
- Каждый платёж имеет `idempotencyKey` (UUID, генерируется клиентом или сервером). Повторный запрос с тем же ключом не создаёт дублей
- Webhook-обработчики тоже идемпотентны — один и тот же webhook может прийти несколько раз

### 3. Webhook Security
- Проверка подписи (HMAC / RSA) для каждого провайдера
- Webhook endpoint без авторизации пользователя, но с верификацией подписи шлюза
- Логирование всех входящих webhook-ов для аудита

### 4. Денежные суммы
- Хранить в **минорных единицах** (копейки/центы) как `integer`, никогда не `float`
- Валюта всегда рядом с суммой (`amount` + `currency`)

### 5. State Machine
- Платёж — это конечный автомат: `pending → processing → succeeded / failed / cancelled`
- Переходы только в допустимых направлениях, невалидные переходы — domain error
- Возврат — отдельный агрегат со своим state machine: `pending → processing → succeeded / failed`

### 6. Reconciliation & Audit
- Хранить полную историю: кто, когда, сколько, за что, через какой шлюз
- Периодическая сверка с шлюзом (cron job) — находить "зависшие" платежи

### 7. Подписки
- Подписка — отдельный агрегат от платежа. Подписка порождает платежи, а не наоборот
- Разделять billing cycle (период оплаты) и access period (период доступа к фичам)
- Grace period при неудачной оплате — не блокировать сразу

---

## Доменная модель

### Агрегаты

#### 1. `PaymentMethod` — Сохранённый способ оплаты
```
State:
  id: PaymentMethodId
  organizationId: OrganizationId
  type: 'card_rf' | 'card_foreign' | 'sbp'
  gatewayId: PaymentGatewayId          // какой шлюз обслуживает этот метод
  externalMethodId: string | null      // токен карты / привязки в шлюзе
  label: string                        // "Visa •••• 4242" / "СБП Сбербанк"
  isDefault: boolean
  status: 'active' | 'expired' | 'removed'
  createdAt, updatedAt

Commands:
  AttachPaymentMethod    → PaymentMethodAttached
  SetDefaultMethod       → DefaultMethodChanged
  RemovePaymentMethod    → PaymentMethodRemoved
  MarkExpired            → PaymentMethodExpired
```

#### 2. `Payment` — Разовый платёж (оплата подписки, покупка)
```
State:
  id: PaymentId
  organizationId: OrganizationId
  subscriptionId: SubscriptionId | null   // если оплата подписки
  paymentMethodId: PaymentMethodId | null
  gatewayId: PaymentGatewayId
  externalPaymentId: string | null        // ID в шлюзе
  idempotencyKey: string
  amount: number                          // в копейках/центах
  currency: 'RUB' | 'USD' | ...
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
  description: string
  metadata: Record<string, string>        // произвольные данные (planId, period и т.д.)
  failureReason: string | null
  paidAt: Date | null
  createdAt, updatedAt

Commands:
  InitiatePayment        → PaymentInitiated        // создаёт платёж, возвращает redirect URL
  ConfirmPayment         → PaymentSucceeded         // webhook: оплата прошла
  FailPayment            → PaymentFailed            // webhook: оплата не прошла
  CancelPayment          → PaymentCancelled         // отмена до завершения

State Machine:
  pending → processing (InitiatePayment отправлен в шлюз)
  processing → succeeded (ConfirmPayment)
  processing → failed (FailPayment)
  pending → cancelled (CancelPayment)
```

#### 3. `Subscription` — Подписка организации
```
State:
  id: SubscriptionId
  organizationId: OrganizationId
  planId: SubscriptionPlanId              // 'free' | 'individual' | 'team'
  status: 'active' | 'past_due' | 'cancelled' | 'expired'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean              // отмена в конце периода (не сразу)
  gracePeriodEnd: Date | null             // дата окончания grace period
  lastPaymentId: PaymentId | null
  createdAt, updatedAt

Commands:
  ActivateSubscription     → SubscriptionActivated       // после успешной оплаты
  RenewSubscription        → SubscriptionRenewed          // продление (новый period)
  MarkPastDue              → SubscriptionPastDue          // оплата не прошла
  CancelSubscription       → SubscriptionCancelled        // пользователь отменил
  ReactivateSubscription   → SubscriptionReactivated      // отмена отмены (пока период не истёк)
  ExpireSubscription       → SubscriptionExpired          // grace period истёк
  ChangeSubscriptionPlan   → SubscriptionPlanChanged      // апгрейд/даунгрейд
  ExtendSubscription       → SubscriptionExtended         // admin: ручное продление
  ForceCancelSubscription  → SubscriptionForceCancelled   // admin: принудительная отмена

State Machine:
  (none) → active          (ActivateSubscription)
  active → active          (RenewSubscription — новый период)
  active → active          (ExtendSubscription — admin продлил период)
  active → cancelled       (CancelSubscription, cancelAtPeriodEnd=true — доступ до конца периода)
  active → expired         (ForceCancelSubscription — admin принудительно отменил)
  active → past_due        (MarkPastDue — оплата не прошла, начался grace period)
  cancelled → active       (ReactivateSubscription — отмена отмены, пока период не истёк)
  past_due → active        (RenewSubscription — оплата прошла в grace period)
  past_due → expired       (ExpireSubscription — grace period истёк)
  cancelled → expired      (ExpireSubscription — период закончился)
```

#### 4. `Refund` — Возврат
```
State:
  id: RefundId
  paymentId: PaymentId
  organizationId: OrganizationId
  gatewayId: PaymentGatewayId
  externalRefundId: string | null
  amount: number                          // частичный или полный возврат
  currency: Currency
  reason: 'requested_by_customer' | 'duplicate' | 'fraudulent' | 'other'
  description: string | null
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  createdAt, updatedAt

Commands:
  InitiateRefund     → RefundInitiated
  ConfirmRefund      → RefundSucceeded       // webhook
  FailRefund         → RefundFailed           // webhook
```

---

## Порты (Application Layer)

```typescript
// === Репозитории (write-side) ===

abstract class PaymentRepository {
  abstract findById(tx, id: PaymentId): Promise<PaymentState | null>
  abstract findByIdempotencyKey(tx, key: string): Promise<PaymentState | null>
  abstract save(tx, state: PaymentState): Promise<void>
}

abstract class SubscriptionRepository {
  abstract findById(tx, id: SubscriptionId): Promise<SubscriptionState | null>
  abstract findByOrganizationId(tx, orgId: OrganizationId): Promise<SubscriptionState | null>
  abstract save(tx, state: SubscriptionState): Promise<void>
}

abstract class RefundRepository {
  abstract findById(tx, id: RefundId): Promise<RefundState | null>
  abstract save(tx, state: RefundState): Promise<void>
}

abstract class PaymentMethodRepository {
  abstract findById(tx, id: PaymentMethodId): Promise<PaymentMethodState | null>
  abstract findByOrganizationId(tx, orgId: OrganizationId): Promise<PaymentMethodState[]>
  abstract save(tx, state: PaymentMethodState): Promise<void>
}

// === Query Ports (read-side) ===

abstract class PaymentQueryPort {
  abstract findPaymentsByOrganization(orgId, pagination): Promise<PaymentListReadModel>
  abstract findPaymentDetail(paymentId): Promise<PaymentDetailReadModel | null>
  abstract findReceipt(paymentId): Promise<PaymentReceiptReadModel | null>
  // admin
  abstract findAllPayments(filters, pagination): Promise<PaymentListReadModel>
}

abstract class SubscriptionQueryPort {
  abstract findByOrganization(orgId): Promise<SubscriptionDetailReadModel | null>
  abstract findExpiring(before: Date): Promise<SubscriptionSummary[]>
  abstract findPastDueExpired(now: Date): Promise<SubscriptionSummary[]>
  // admin
  abstract findAll(filters, pagination): Promise<SubscriptionListReadModel>
}

abstract class RefundQueryPort {
  abstract findByOrganization(orgId, pagination): Promise<RefundListReadModel>
  abstract findDetail(refundId): Promise<RefundDetailReadModel | null>
}

abstract class PlanCatalogQueryPort {
  abstract findAll(): Promise<PlanCatalogReadModel[]>   // публичный, без авторизации
}

// === Payment Gateway Port (ключевой порт для мульти-шлюзовости) ===

abstract class PaymentGateway {
  abstract readonly gatewayId: PaymentGatewayId
  abstract readonly supportedMethods: PaymentMethodType[]

  abstract createPayment(params: CreateGatewayPaymentParams): Promise<GatewayPaymentResult>
  abstract getPaymentStatus(externalId: string): Promise<GatewayPaymentStatus>
  abstract createRefund(params: CreateGatewayRefundParams): Promise<GatewayRefundResult>
  abstract verifyWebhookSignature(headers, body): boolean

  // Привязка карты / метода
  abstract createPaymentMethod(params): Promise<GatewayMethodResult>
  abstract removePaymentMethod(externalMethodId: string): Promise<void>
}

// === Gateway Registry (выбор шлюза по типу оплаты) ===

abstract class PaymentGatewayRegistry {
  abstract getGateway(gatewayId: PaymentGatewayId): PaymentGateway
  abstract resolveGateway(methodType: PaymentMethodType): PaymentGateway
  // 'card_rf' → YooKassa, 'card_foreign' → Stripe, 'sbp' → YooKassa/Tinkoff
}
```

---

## Структура модуля

```
src/features/payments/
├── domain/
│   ├── aggregates/
│   │   ├── payment/
│   │   │   ├── entity.ts            // PaymentEntity (functional decider)
│   │   │   ├── state.ts
│   │   │   ├── commands.ts
│   │   │   ├── events.ts
│   │   │   └── errors.ts
│   │   ├── subscription/
│   │   │   ├── entity.ts
│   │   │   ├── state.ts
│   │   │   ├── commands.ts
│   │   │   ├── events.ts
│   │   │   ├── config.ts            // billing periods, grace period duration
│   │   │   └── errors.ts
│   │   ├── refund/
│   │   │   ├── entity.ts
│   │   │   ├── state.ts
│   │   │   ├── commands.ts
│   │   │   ├── events.ts
│   │   │   └── errors.ts
│   │   └── payment-method/
│   │       ├── entity.ts
│   │       ├── state.ts
│   │       ├── commands.ts
│   │       ├── events.ts
│   │       └── errors.ts
│   ├── policies/
│   │   ├── when-payment-succeeded-activate-subscription.policy.ts
│   │   ├── when-payment-failed-mark-past-due.policy.ts
│   │   ├── when-subscription-expired-downgrade-to-free.policy.ts
│   │   └── when-refund-succeeded-adjust-subscription.policy.ts
│   ├── read-models/
│   │   ├── payment-detail.read-model.ts
│   │   ├── payment-list.read-model.ts
│   │   ├── payment-receipt.read-model.ts
│   │   ├── subscription-detail.read-model.ts
│   │   ├── plan-catalog.read-model.ts         // публичный каталог тарифов
│   │   ├── refund-detail.read-model.ts
│   │   ├── refund-list.read-model.ts
│   │   └── payment-method-list.read-model.ts
│   └── vo/
│       ├── money.ts                  // { amount: number, currency: Currency }
│       ├── currency.ts
│       └── billing-period.ts
│
├── application/
│   ├── ports.ts                      // все abstract class порты
│   └── use-cases/
│       ├── payments/
│       │   ├── initiate-payment.interactor.ts
│       │   └── handle-payment-webhook.interactor.ts
│       ├── subscriptions/
│       │   ├── subscribe.interactor.ts           // выбор плана → создание платежа
│       │   ├── change-plan.interactor.ts         // апгрейд/даунгрейд
│       │   ├── cancel-subscription.interactor.ts
│       │   ├── reactivate-subscription.interactor.ts  // отмена отмены (пока период не истёк)
│       │   ├── renew-subscription.handler.ts     // cron: автопродление
│       │   ├── expire-past-due.handler.ts        // cron: истечение grace period
│       │   └── admin/
│       │       ├── extend-subscription.interactor.ts  // admin: ручное продление
│       │       └── force-cancel-subscription.interactor.ts // admin: принудительная отмена
│       ├── refunds/
│       │   ├── request-refund.interactor.ts
│       │   └── handle-refund-webhook.interactor.ts
│       └── payment-methods/
│           ├── attach-payment-method.interactor.ts
│           ├── remove-payment-method.interactor.ts
│           └── set-default-method.interactor.ts
│
├── adapters/
│   ├── db/
│   │   ├── schema.ts                 // Drizzle tables
│   │   ├── repositories/
│   │   │   ├── payment.repository.ts
│   │   │   ├── subscription.repository.ts
│   │   │   ├── refund.repository.ts
│   │   │   └── payment-method.repository.ts
│   │   └── queries/
│   │       ├── payment.query.ts
│   │       ├── subscription.query.ts
│   │       └── refund.query.ts
│   ├── http/
│   │   ├── payments.controller.ts         // GET /payments, GET /payments/:id, GET /payments/:id/receipt
│   │   ├── subscriptions.controller.ts    // POST /subscriptions/checkout, GET /current, PATCH /current/plan, POST /current/cancel, POST /current/reactivate
│   │   ├── plans.controller.ts            // GET /plans (публичный каталог тарифов)
│   │   ├── payment-methods.controller.ts  // CRUD для методов оплаты
│   │   ├── refunds.controller.ts          // GET /refunds, GET /refunds/:id
│   │   ├── webhooks.controller.ts         // POST /webhooks/yookassa, /webhooks/stripe
│   │   └── admin/
│   │       ├── admin-subscriptions.controller.ts  // GET /admin/subscriptions, POST /:id/extend, POST /:id/cancel
│   │       └── admin-payments.controller.ts       // GET /admin/payments
│   ├── gateways/
│   │   ├── yookassa/
│   │   │   ├── yookassa.gateway.ts        // implements PaymentGateway
│   │   │   ├── yookassa.types.ts          // API types провайдера
│   │   │   └── yookassa.webhook-parser.ts
│   │   ├── stripe/
│   │   │   ├── stripe.gateway.ts
│   │   │   ├── stripe.types.ts
│   │   │   └── stripe.webhook-parser.ts
│   │   └── gateway-registry.ts            // PaymentGatewayRegistry implementation
│   └── kafka/
│       └── payment-events.publisher.ts    // интеграционные события для других модулей
│
└── payments.module.ts
```

---

## Ключевые use-case flows

### Flow 1: Оформление подписки

```
1. Пользователь выбирает план (individual/team) и способ оплаты (card_rf/card_foreign/sbp)
2. Controller → SubscribeInteractor.execute({ orgId, planId, methodType })
3. Interactor:
   a. GatewayRegistry.resolveGateway(methodType) → конкретный gateway
   b. PaymentEntity.initiate({ amount, currency, gatewayId, ... })
   c. Gateway.createPayment({ amount, returnUrl, ... }) → { externalId, confirmationUrl }
   d. Сохраняем Payment (status: processing) + Subscription (status: pending)
   e. Возвращаем { confirmationUrl } — клиент делает redirect
4. Пользователь оплачивает на стороне шлюза
5. Webhook → HandlePaymentWebhookInteractor:
   a. Gateway.verifyWebhookSignature()
   b. PaymentEntity.confirm() → PaymentSucceeded
   c. Policy: whenPaymentSucceeded → ActivateSubscription command
   d. SubscriptionEntity.activate()
   e. Integration event → organization feature: ChangeSubscription(planId)
```

### Flow 2: Автопродление (cron)

```
1. RenewSubscriptionHandler (cron, каждый день):
   a. SubscriptionQuery.findExpiring(within: 1 day)
   b. Для каждой: создать Payment через default PaymentMethod
   c. Gateway.createPayment() — рекуррентный (без redirect)
   d. Если succeeded → SubscriptionEntity.renew(newPeriodEnd)
   e. Если failed → SubscriptionEntity.markPastDue(gracePeriodEnd)
```

### Flow 3: Grace period & downgrade

```
1. ExpirePastDueHandler (cron, каждый день):
   a. SubscriptionQuery.findPastDueExpired(now)
   b. SubscriptionEntity.expire()
   c. Policy: whenSubscriptionExpired → DowngradeToFree
   d. Integration event → organization feature: DowngradeToFree command
      (блокирует лишних сотрудников, снимает публикации)
```

### Flow 4: Возврат

```
1. RequestRefundInteractor.execute({ paymentId, amount?, reason })
2. Проверка: платёж succeeded, amount <= оплаченная сумма
3. RefundEntity.initiate()
4. Gateway.createRefund({ externalPaymentId, amount })
5. Webhook → HandleRefundWebhookInteractor:
   a. RefundEntity.confirm() → RefundSucceeded
   b. Если полный возврат подписки → CancelSubscription + DowngradeToFree
```

---

## Интеграция с существующим кодом

### Kernel additions

```typescript
// kernel/domain/ids.ts
export type PaymentId = EntityId<'Payment'>;
export type SubscriptionId = EntityId<'Subscription'>;
export type RefundId = EntityId<'Refund'>;
export type PaymentMethodId = EntityId<'PaymentMethod'>;
export type PaymentGatewayId = EntityId<'PaymentGateway'>;

// kernel/domain/permissions.ts
export const Permissions = {
  ...existing,
  managePayments: BooleanPerm('PAYMENT.MANAGE', false),
  manageSubscription: BooleanPerm('SUBSCRIPTION.MANAGE', false),
};
```

### Integration events (kernel → organization)

Когда подписка активируется/меняется/истекает — payments отправляет Kafka event, organization слушает и вызывает `ChangeSubscription` / `DowngradeToFree` на своём агрегате. Фичи не импортируют друг друга напрямую.

```typescript
// kernel/application/integration-events
type SubscriptionActivatedIntegrationEvent = {
  type: 'subscription.activated';
  organizationId: string;
  planId: SubscriptionPlanId;
  periodEnd: string;
};

type SubscriptionExpiredIntegrationEvent = {
  type: 'subscription.expired';
  organizationId: string;
};
```

### Database tables (новые)

```
payments          — id, organization_id, subscription_id, gateway_id, external_id,
                    idempotency_key, amount, currency, status, metadata, failure_reason,
                    paid_at, created_at, updated_at

subscriptions     — id, organization_id, plan_id, status,
                    current_period_start, current_period_end,
                    cancel_at_period_end, grace_period_end,
                    last_payment_id, created_at, updated_at

refunds           — id, payment_id, organization_id, gateway_id, external_id,
                    amount, currency, reason, description, status,
                    created_at, updated_at

payment_methods   — id, organization_id, type, gateway_id, external_method_id,
                    label, is_default, status, created_at, updated_at

webhook_logs      — id, gateway_id, event_type, payload (jsonb),
                    processed, created_at
```

---

## Конфигурация шлюзов

```typescript
// Маппинг типов оплаты → шлюз
const GATEWAY_ROUTING: Record<PaymentMethodType, PaymentGatewayId> = {
  'card_rf': 'yookassa',       // российские карты → ЮKassa
  'sbp':     'yookassa',       // СБП → ЮKassa (или Tinkoff)
  'card_foreign': 'stripe',    // иностранные карты → Stripe
};
```

Роутинг настраивается через конфиг (env/DB), а не хардкодится. Позволяет:
- Переключить `sbp` с YooKassa на Tinkoff без изменений кода
- Добавить новый шлюз — реализовать адаптер `PaymentGateway` + добавить в registry

---

## Порядок реализации (волны)

### Волна 1 — MVP подписки
1. Domain: `Subscription`, `Payment` агрегаты (entity, state, commands, events, errors)
2. Domain: value objects (`Money`, `Currency`, `BillingPeriod`)
3. Application: `ports.ts`, `SubscribeInteractor`, `HandlePaymentWebhookInteractor`
4. Adapter: один gateway (YooKassa), DB schema + repositories
5. HTTP: `POST /subscriptions/checkout`, `GET /subscriptions/current`, `POST /webhooks/yookassa`
6. HTTP: `GET /plans` — публичный каталог тарифов с ценами и фичами
7. Integration event → organization `ChangeSubscription`
8. Policies: `whenPaymentSucceeded → activateSubscription`

### Волна 2 — Управление подписками
1. `CancelSubscriptionInteractor`, `ReactivateSubscriptionInteractor`, `ChangePlanInteractor`
2. Cron: `RenewSubscriptionHandler`, `ExpirePastDueHandler`
3. `PaymentMethod` агрегат + CRUD endpoints
4. `GET /payments` (история), `GET /payments/:id`, `GET /payments/:id/receipt`
5. Grace period logic

### Волна 3 — Возвраты + второй шлюз
1. `Refund` агрегат
2. `RequestRefundInteractor`, `HandleRefundWebhookInteractor`
3. `GET /refunds`, `GET /refunds/:id`
4. Stripe gateway adapter
5. `PaymentGatewayRegistry` с роутингом по `methodType`
6. `webhook_logs` table для аудита

### Волна 4 — Admin + Hardening
1. Admin endpoints:
   - `GET /admin/subscriptions` — все подписки (фильтр по статусу, плану, организации)
   - `GET /admin/payments` — все платежи в системе
   - `POST /admin/subscriptions/:id/extend` — ручное продление (support-кейсы)
   - `POST /admin/subscriptions/:id/cancel` — принудительная отмена
2. Reconciliation cron (сверка со шлюзами)
3. E2E тесты с мок-шлюзом
4. Retry logic для webhook failures
5. Метрики и алерты (failed payments, expired subscriptions)

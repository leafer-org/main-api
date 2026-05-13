# Refactor #1 — Migrate `users` to thin events + `UserDirectoryPort`

## Цель

Заменить fat snapshot-событие `user.streaming` на тонкое событие-сигнал.
Вынести в kernel минимальный `UserDirectoryPort` для batch-обогащения
из других фич (chat preview, etc.).

## Объём

~3-4ч. **Низкий риск.**

## Когда делать

Не срочно. Триггеры:
- Появление нового поля в user-state (тогда вместо расширения fat-контракта — мигрируем)
- Появление 2-го consumer'а `user.streaming` (rationale за thin усиливается)
- Race-issue между out-of-order user-событиями (theoretical → practical)

Сейчас только discovery читает поток, и работает корректно.

## Шаги

### 1. Kernel-порт

Файл: `src/kernel/application/ports/user-directory.ts`

```ts
export type UserDirectoryView = {
  userId: UserId;
  fullName: string;
  avatarMediaId: string | null;
  cityId: string;
  lat: number | null;
  lng: number | null;
};

export abstract class UserDirectoryPort {
  abstract findByIds(ids: readonly UserId[]): Promise<UserDirectoryView[]>;
}
```

**Решение:** новый порт, не расширение `UserLookupPort`. У `UserLookupPort`
семантика «admin lookup» (включает `phone`, `role`); `UserDirectoryPort` —
«public lookup» без privacy-полей.

### 2. Реализация в idp

Файл: `src/features/idp/adapters/db/user-directory.adapter.ts`

Тривиальный `WHERE id IN (...)` по `users` table, маппинг в `UserDirectoryView`.

Регистрация в `IdpModule` — он уже `@Global()`, добавить в `exports`.

### 3. Тонкое событие

Файл: `src/infra/kafka-contracts/user.contract.ts`

Заменить `UserSnapshotMessage` на:

```ts
{
  userId: string,
  type: 'user.profile-changed',
  changedAt: string  // ISO
}
```

- Топик `user.streaming` оставить (тот же — не ломаем инфру)
- Контракт-имя `userStreamingContract` сохранить
- Меняется только schema payload'а

### 4. Publisher

`src/features/idp/adapters/db/repositories/user.repository.ts`:

- Заменить `outbox.enqueue` с 11 полями → enqueue с
  `{ userId, type: 'user.profile-changed', changedAt: state.updatedAt.toISOString() }`
- Эмитить на каждый `save` (создание + обновление профиля + блокировка/разблокировка)

### 5. Consumer'ы

`src/features/discovery/application/use-cases/project-user/project-user.handler.ts`:

```ts
async handleUserEvent(eventId, { userId }) {
  if (await idempotency.isProcessed(eventId)) return;
  const [user] = await this.userDirectory.findByIds([userId]);
  if (!user) return;  // user удалён — пропускаем (или delete в gorse)
  const labels = user.lat && user.lng ? h3Labels(user.lat, user.lng) : [];
  await this.gorse.upsertUser(user.userId, labels, user.fullName);
  await idempotency.markProcessed(eventId);
}
```

`src/features/discovery/adapters/kafka/user-projection.handler.ts`:
- Принимать `{ userId }` вместо payload'а (snapshot полей)

Регистрация `UserDirectoryPort` в discovery как dependency (DI).

### 6. Удаление старого

В контракте, в payload, в обёртках — никаких compat-shim'ов. Поломаем за один коммит.

### 7. Миграция данных

Не нужна — это events-pipeline. Старые сообщения в Kafka топике уже обработаны.

### 8. Tests

- e2e: создание user → discovery видит его в Gorse (как сейчас)
- e2e: блокировка user → handler читает свежий state и обновляет (TODO если уже не покрыто)

## Риски

- **Out-of-order events.** При rapid update'ах Kafka может доставить B перед A.
  Под старой схемой (fat) → race с reverted state. Под новой (thin + read свежего) →
  последний read всегда актуален → автоматически правильно. **Это улучшение.**
- Discovery handler требует idp.UserDirectoryPort. Если idp недоступен — handler
  падает с retry. То же поведение что было.

## Критические допущения

- Топик `user.streaming` имеет одного consumer'а (discovery). Если ещё кто-то
  консьюмит — мигрировать всех одновременно.
- idp's `users` table — single PK lookup ≪ 1ms. Sync read дешёвый.

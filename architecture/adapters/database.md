# Database (Drizzle ORM)

## Структура

```
adapters/db/
├── schema.ts           ← Drizzle-таблицы (pgTable, relations)
├── client.ts           ← DatabaseClient для feature
├── repositories/       ← Write-side (Transaction)
│   ├── user.repository.ts
│   └── session.repository.ts
└── queries/            ← Read-side (DatabaseClient)
    ├── me.query.ts
    └── role.query.ts
```

## Repository Adapter (write-side)

Реализует порт из `application/ports.ts`. Работает с `Transaction` через `TransactionHostPg`.

```ts
@Injectable()
export class DrizzleUserRepository implements UserRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, userId: UserId): Promise<UserState | null> {
    const db = this.txHost.get(tx);               // получаем Drizzle-клиент из транзакции
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);                     // конвертация DB -> domain state
  }

  public async save(tx: Transaction, state: UserState): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(users)
      .values({
        id: state.id,
        phoneNumber: state.phoneNumber as string,  // branded -> primitive
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
      id: UserId.raw(row.id),                     // primitive -> branded
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

- Реализует абстрактный порт (`implements UserRepository`)
- Инъектирует `TransactionHostPg` (конкретная реализация, не абстрактный `TransactionHost`)
- Все методы принимают `Transaction` первым параметром
- `toDomain()` — приватный метод для конвертации DB-строки в domain state
- Персистенция через `upsert` (`onConflictDoUpdate`) для идемпотентности

## Query Adapter (read-side)

Работает напрямую с пулом соединений через `DatabaseClient`, без транзакций.

```ts
@Injectable()
export class DrizzleMeQuery implements MeQueryPort {
  public constructor(private readonly dbClient: IdpDatabaseClient) {}

  public async findMe(userId: UserId, sessionId: SessionId): Promise<MeReadModel | null> {
    const rows = await this.dbClient.db
      .select({
        userId: users.id,
        role: users.role,
        sessionId: sessions.id,
        fullName: users.fullName,
        phoneNumber: users.phoneNumber,
      })
      .from(users)
      .innerJoin(sessions, and(eq(sessions.userId, users.id), eq(sessions.id, sessionId)))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return { /* read model */ };
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

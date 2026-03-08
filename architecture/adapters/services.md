# Services (ID, JWT, OTP, S3)

Адаптеры инфраструктурных сервисов. Реализуют порты из `application/ports.ts`.

## Структура

```
adapters/
├── id/                   ← ID-генераторы
│   └── id-generator.service.ts
├── jwt/                  ← JWT-сервисы
│   ├── jwt-access.service.ts
│   └── refresh-token.service.ts
├── otp/                  ← OTP-сервисы
│   └── otp-generator.service.ts
├── s3/                   ← Файловое хранилище
│   └── s3-file-storage.service.ts
└── search/               ← Meilisearch
    ├── *.index.ts
    ├── *-list.query.ts
    └── *-list.repository.ts
```

## Meilisearch (поиск)

### Index Definition

```ts
export const ADMIN_USERS_INDEX = 'admin_users';

export const adminUsersIndexDefinition: IndexDefinition = {
  name: ADMIN_USERS_INDEX,
  primaryKey: 'userId',
  searchableAttributes: ['fullName', 'phoneNumber'],
  filterableAttributes: ['role', 'createdAt', 'updatedAt'],
  sortableAttributes: ['createdAt', 'updatedAt'],
};

export const AdminUsersSearchClient = CreateSearchClient([adminUsersIndexDefinition]);
```

### Query Adapter

```ts
@Injectable()
export class MeiliAdminUsersListQuery implements AdminUsersListQueryPort {
  public constructor(
    @Inject(AdminUsersSearchClient) private readonly searchClient: SearchClient,
  ) {}

  public async search(params: SearchParams): Promise<{ users: User[]; total: number }> {
    const result = await this.searchClient.search(ADMIN_USERS_INDEX, {
      q: params.query,
      filter: buildFilters(params),
      sort: params.sort,
      offset: params.from,
      limit: params.size,
    });
    return { users: result.hits, total: result.total };
  }
}
```

## Правила

- `@Injectable()` декоратор
- Реализует абстрактный порт через `implements` (не `extends`)
- Регистрация в модуле: `{ provide: Port, useClass: Adapter }`
- `@Inject(Token)` для abstract class DI-токенов

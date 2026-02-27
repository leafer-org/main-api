## Контракты для Rest API

В проекте мы используем подход contract first.

Это значит, что контракты описыавются в отдельном репозитории `pl-openapi`,
после чего на основании их генерируется и front-end и back-end код.

## Как обновить контракты

1. Обновить контракты в репозитории `pl-openapi`
2. Запустить скрипт `npm run gen-api`

**Важно**: Для запуска скрипта нужно, что бы репозитории `pl-openapi` и `pl-api` находились в одной директории.
Генерация происходит на основании текущей ветки `pl-openapi` Это нужно для возможности паралленой разработки

После запуска скрипта заработает валидация запросов на основании новых контрактов и будут доступны типы для описания контроллеров.

## Пример контроллера

```ts
import { AdminBody, AdminResponse, AdminSchemas } from '@contracts';

@Controller('rest-api/admin')
export class AdminController {
  @Post()
  getAdmin(@Body() body: AdminBody['getAdmin']): Promise<AdminResponse['getAdmin']> {
    const test: AdminSchemas['Test'] = {
      message: 'test',
    };
    return test;
  }
}
```

## Добавление новых типов.

Все генерированные типы находсятся в `generated-admin-schema.d.ts`.

Но для их удобного использования мы добавляем в `types.ts` типы с более удобным доступом

```ts
import { operations } from './generated-admin-schema';
import { AdminResponses } from '@contracts';

// Вместо вот такого
export type R1 = operations['getAdmin']['responses']['200']['content']['application/json'];
// Мы используем такое
export type R2 = AdminResponses['getAdmin'];
```

Если вам не хватает существующих типов `AdminResponses`, `AdminRequests`, `AdminSchemas`, вы можете добавить новые типы в `types.ts` по примеру.

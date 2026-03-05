# Архитектура — Functional Decider

Проект построен на Hexagonal Architecture + CQRS + функциональном Decider-паттерне.

## Spec driven development

Если в дирректории находится файл MODULE_SPEC.md

Значит это модуль. И там описаны требования и архитектура модуля.

Если пункт спеки помечен TODO: значит это ещё не готово и требует реализации.

MODULE_SPEC.md это источник истины. Если код расходится со спекой, значит нужно изменить код!

## Разделы

1. **[Domain](architecture/1-domain.md)** — агрегаты (Decide + Apply), state, events, commands, value objects, policies, read models
2. **[Application](architecture/2-application.md)** — use cases, interactors, handlers, queries, порты, проверка прав
3. **[Adapters](architecture/3-adapters.md)** — HTTP-контроллеры, DB-репозитории, Kafka publishers, регистрация в модулях
4. **[Infra](architecture/4-infra.md)** — Either/Box, DDD-примитивы, Clock, Drizzle, Authorization, Kafka, Outbox, Search
5. **[Kernel](architecture/5-kernel.md)** — shared IDs, value objects, integration events, application ports, permissions

## Зависимости между слоями

```
kernel/domain     ← infra/ddd
kernel/application ← kernel/domain
feature/domain    ← kernel/domain, infra/ddd
feature/application ← feature/domain, kernel/application
feature/adapters  ← feature/application, infra/lib
```

Feature **никогда** не импортирует другую feature. Вся коммуникация — через kernel.

## Агрегаты в проекте

| Агрегат | Путь | Decide | Состояние |
|---------|------|--------|-----------|
| LoginProcess | `idp/domain/aggregates/login-process/` | `decide/` (папка) | discriminated union |
| User | `idp/domain/aggregates/user/` | `decide.ts` (файл) | простой тип |
| Session | `idp/domain/aggregates/session/` | `decide.ts` (файл) | простой тип, apply → `State \| null` |
| Role | `idp/domain/aggregates/role/` | `decide.ts` (файл) | простой тип |

## Features

| Feature | Назначение |
|---------|-----------|
| `idp` | Identity Provider — авторизация, пользователи, роли, сессии |
| `media` | Файлы и хранилище (S3) |
| `discovery` | Каталог сервисов и поиск |

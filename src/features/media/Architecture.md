# Архитектура модуля Media

## Обзор

Модуль управления загрузкой, хранением и получением файлов. Построен на **гексагональной архитектуре (Ports & Adapters)** с паттернами **DDD** и **Event Sourcing**.

## Структура директорий

```
media/
├── domain/                         # Чистая бизнес-логика (без зависимостей)
│   ├── aggregates/file/
│   │   ├── state.ts                # Состояние агрегата (id, name, bucket, mimeType, isTemporary)
│   │   ├── commands.ts             # UploadFile, UseFile, FreeFile
│   │   ├── events.ts               # FileUploaded, FileUsed, FileFreed
│   │   ├── decide.ts               # Command → Event (валидация + бизнес-правила)
│   │   ├── apply.ts                # Event → State (проекция состояния)
│   │   └── errors.ts               # FileAlreadyExists, FileNotFound, FileAlreadyInUse
│   └── vo/
│       ├── file-name.ts            # Value Object (1-255 символов, с обрезкой пробелов)
│       └── mime-type.ts            # Value Object (regex-валидация, isImage())
├── application/                    # Сценарии использования + интерфейсы портов
│   ├── ports.ts                    # FileRepository, FileStorageService, MediaUrlService, FileIdGenerator
│   ├── use-cases/
│   │   ├── upload/request-upload.interactor.ts   # Создание файла + presigned URL для загрузки
│   │   ├── use-file.interactor.ts                # Перевод temp → permanent
│   │   └── free-file.interactor.ts               # Удаление файла из БД + S3
│   └── queries/
│       └── get-download-url.interactor.ts        # Получение URL для скачивания (с кэшем)
├── adapters/                       # Реализации портов (инфраструктура)
│   ├── db/file.repository.ts       # Drizzle ORM + PostgreSQL
│   ├── s3/
│   │   ├── s3-client.service.ts    # Обёртка над AWS SDK v3
│   │   └── file-storage.service.ts # Реализация FileStorageService
│   └── media/
│       └── media-url.service.ts    # Кэширование presigned URL (in-memory, TTL 50 мин)
└── media.module.ts                 # NestJS-модуль (DI-связка + экспорты)
```

## Паттерн Decide/Apply

Доменная логика реализована как чистые функции без побочных эффектов:

```
fileDecide(state, command) → Either<Error, Event>   # валидация команды относительно текущего состояния
fileApply(state, event)   → FileState | null         # трансформация состояния на основе события
```

Это позволяет легко писать юнит-тесты без моков.

## Жизненный цикл файла

```
RequestUpload            UseFile                FreeFile
     │                      │                      │
     ▼                      ▼                      ▼
[не существует] ──► [временный] ──► [постоянный] ──► [удалён]
                    (temp-бакет)    (perm-бакет)
```

1. **RequestUpload** — создаёт запись в БД (`isTemporary=true`), возвращает presigned URL для загрузки во временный бакет
2. **UseFile** — копирует файл в постоянный бакет (S3 copy), устанавливает `isTemporary=false`
3. **FreeFile** — удаляет из БД и S3 (определяет бакет по флагу `isTemporary`)
4. **GetDownloadUrl** — возвращает presigned URL для скачивания с in-memory кэшированием

## Порты

Определены в `application/ports.ts`:

| Порт                | Назначение                                          |
| ------------------- | --------------------------------------------------- |
| FileRepository      | CRUD метаданных файлов (findById, save, deleteById) |
| FileStorageService  | Presigned URL, копирование, удаление в S3           |
| MediaUrlService     | Получение URL для скачивания с кэшированием         |
| FileIdGenerator     | Генерация уникальных ID файлов                      |

## Инфраструктура

- **PostgreSQL** (Drizzle ORM) — таблица `files` для метаданных
- **S3** — хранилище файлов (раздельные временный и постоянный бакеты)
- **In-memory кэш** — presigned URL (TTL 50 мин, LRU на 1000 записей, таймаут 5 сек)
- **Image Proxy** (опционально) — проксирование URL изображений через CDN (`MEDIA_IMAGE_PROXY_URL`)

## Экспорты модуля

`MediaModule` экспортирует `CachedMediaUrlService`, `UseFileInteractor`, `FreeFileInteractor` для использования другими модулями.

## Ключевые принципы

- **Either-монада** для обработки ошибок (без исключений в домене)
- **Транзакции** — все записи через `TransactionHost`
- **Чистые функции** в доменном слое — легко тестировать
- **Зависимости направлены внутрь** — адаптеры зависят от портов, не наоборот

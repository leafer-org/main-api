# Архитектура модуля Media

## Обзор

Модуль управления загрузкой, хранением и получением файлов. Построен на **гексагональной архитектуре (Ports & Adapters)** с паттернами **DDD** и **Event Sourcing**.

## Структура директорий

```
media/
├── domain/                         # Чистая бизнес-логика (без зависимостей)
│   ├── aggregates/file/
│   │   ├── state.ts                # Состояние агрегата (id, name, bucket, mimeType, isTemporary, createdAt)
│   │   ├── commands.ts             # UploadFile, UseFile, FreeFile
│   │   ├── events.ts               # FileUploaded, FileUsed, FileFreed
│   │   ├── decide.ts               # Command → Event (валидация + бизнес-правила)
│   │   ├── apply.ts                # Event → State (проекция состояния)
│   │   └── errors.ts               # FileAlreadyExists, FileNotFound, FileAlreadyInUse
│   └── vo/
│       ├── file-name.ts            # Value Object (1-255 символов, с обрезкой пробелов)
│       └── mime-type.ts            # Value Object (regex-валидация, isImage())
├── application/                    # Сценарии использования + интерфейсы портов
│   ├── ports.ts                    # FileRepository, FileStorageService, MediaUrlService, ImageProxyUrlSigner, FileIdGenerator
│   ├── use-cases/
│   │   ├── upload/request-upload.interactor.ts   # Создание файла + presigned URL для загрузки
│   │   ├── use-file.interactor.ts                # Перевод temp → permanent (одиночный)
│   │   ├── use-files.interactor.ts               # Перевод temp → permanent (batch)
│   │   ├── free-file.interactor.ts               # Удаление файла из БД + S3 (одиночный)
│   │   └── free-files.interactor.ts              # Удаление файлов из БД + S3 (batch)
│   └── queries/
│       ├── get-download-url.interactor.ts          # URL для скачивания постоянных файлов (с кэшем)
│       └── get-preview-download-url.interactor.ts  # URL для превью временных файлов (TTL 5 мин)
├── adapters/                       # Реализации портов (инфраструктура)
│   ├── db/
│   │   ├── schema.ts              # Drizzle-схема таблицы files
│   │   ├── client.ts              # MediaDatabaseClient
│   │   └── file.repository.ts    # DrizzleFileRepository (Drizzle ORM + PostgreSQL)
│   ├── s3/
│   │   ├── s3-client.service.ts    # Обёртка над AWS SDK v3
│   │   └── file-storage.service.ts # Реализация FileStorageService
│   ├── media/
│   │   ├── media-url.service.ts        # CachedMediaUrlService — кэширование presigned/CDN URL
│   │   ├── media.service.ts            # MediaServiceAdapter — мост к kernel MediaService
│   │   └── image-proxy-url-signer.ts   # HmacImageProxyUrlSigner — HMAC-подписание proxy URL
│   └── http/
│       └── media.controller.ts    # HTTP-контроллер (upload-request, confirm-upload, preview)
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
RequestUpload            UseFile(s)             FreeFile(s)
     │                      │                      │
     ▼                      ▼                      ▼
[не существует] ──► [временный] ──► [постоянный] ──► [удалён]
                    (temp-бакет)    (perm-бакет)
```

1. **RequestUpload** — создаёт запись в БД (`isTemporary=true`), возвращает presigned URL для загрузки во временный бакет
2. **UseFile / UseFiles** — копирует файл(ы) в постоянный бакет (S3 copy + delete temp), устанавливает `isTemporary=false`
3. **FreeFile / FreeFiles** — удаляет из БД и S3 (определяет бакет по флагу `isTemporary`)
4. **GetDownloadUrl** — возвращает presigned URL или CDN URL для скачивания с in-memory кэшированием
5. **GetPreviewDownloadUrl** — возвращает presigned URL для временных файлов (TTL 5 мин, без кэширования)

## Порты

Определены в `application/ports.ts`:

| Порт                 | Назначение                                                              |
| -------------------- | ----------------------------------------------------------------------- |
| FileRepository       | CRUD метаданных файлов (findById, findByIds, save, deleteById, deleteByIds) |
| FileStorageService   | Presigned URL (upload/download), копирование, удаление в S3             |
| MediaUrlService      | Получение URL для скачивания с кэшированием и image proxy               |
| ImageProxyUrlSigner  | HMAC-подписание URL для image proxy                                     |
| FileIdGenerator      | Генерация уникальных ID файлов                                          |

## HTTP API

Контроллер `MediaController` (`/media`):

| Метод | Эндпоинт              | Описание                                    |
| ----- | ---------------------- | ------------------------------------------- |
| POST  | `/upload-request`      | Создание файла + получение presigned upload URL |
| POST  | `/confirm-upload`      | Подтверждение загрузки (batch UseFiles)      |
| GET   | `/preview/:mediaId`    | Получение preview URL для временного файла   |

## Инфраструктура

- **PostgreSQL** (Drizzle ORM) — таблица `files` для метаданных
- **S3** — хранилище файлов (раздельные временный и постоянный бакеты, конвенция: `{bucket}-temp`)
- **In-memory кэш** — presigned/CDN URL (TTL: public 55 мин / private 50 мин, макс. 2000 записей, таймаут 5 сек)
- **CDN** (опционально) — прямые URL для публичных постоянных файлов (`MEDIA_PUBLIC_CDN_URL`)
- **Image Proxy** (опционально) — проксирование URL изображений с ресайзом (`MEDIA_IMAGE_PROXY_URL`, HMAC через `MEDIA_IMAGE_PROXY_SECRET`)

## Visibility

URL для скачивания генерируются с учётом visibility (`PUBLIC` / `PRIVATE`):

- **PUBLIC** + CDN настроен + файл постоянный → прямой CDN URL (без presigned), кэш TTL 55 мин
- **PUBLIC** без CDN → presigned URL (TTL 1 час), кэш TTL 55 мин
- **PRIVATE** → presigned URL (TTL 1 час), кэш TTL 50 мин
- Image proxy применяется автоматически для изображений, если настроен `MEDIA_IMAGE_PROXY_URL`

## Экспорты модуля

`MediaModule` экспортирует `MediaService` (реализован через `MediaServiceAdapter`), который предоставляет другим модулям:
- `getDownloadUrl` / `getDownloadUrls` — получение URL для скачивания
- `getPreviewDownloadUrl` — preview URL для временных файлов
- `useFiles` — batch-перевод файлов в постоянные
- `freeFiles` — batch-удаление файлов

## Ключевые принципы

- **Either-монада** для обработки ошибок (без исключений в домене)
- **Транзакции** — все записи через `TransactionHost`
- **Чистые функции** в доменном слое — легко тестировать
- **Зависимости направлены внутрь** — адаптеры зависят от портов, не наоборот

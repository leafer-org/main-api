# Эпик 1: Media Carousel — единый MediaId + карусель

> Следующий эпик: [video-in-items.md](video-in-items.md) — загрузка, обработка и воспроизведение видео

## Context

Сейчас в media feature один File агрегат с одной таблицей и одним `FileId`. Items и organizations поддерживают только одно изображение. Нужно:

1. Ввести единый `MediaId` с type discriminator — одна таблица `media` + отдельная `video_details`
2. Добавить **карусель** `media: MediaItem[]` в items и organizations
3. Image upload работает полноценно (ренейм File → Media/Image flow). Video — скелет

## Ключевые решения

- **Один `MediaId`** — потребители (item, org) не различают image/video на уровне ID
- **Type в данных** — `MediaItem = ImageMedia | VideoMedia`, тип хранится в карусели для бизнес-логики (напр. "видео только по подписке")
- **Одна таблица `media`** с общими полями + `type` discriminator. Video-специфичные поля в отдельной `video_details`
- **`useMedia` / `freeMedia`** — единые операции, внутри роутинг по типу

---

## Часть A: Kernel — новые типы

### A1. MediaId в `src/kernel/domain/ids.ts`

Переименовать `ImageId` → `MediaId`:

```typescript
export type MediaId = EntityId<'Media'>;
export const MediaId = createEntityId<MediaId>();
```

> Текущий `ImageId` (бывший `FileId`) становится `MediaId`.

### A2. MediaItem VO — `src/kernel/domain/vo/media-item.ts` (новый файл)

```typescript
import type { MediaId } from '../ids.js';

export type ImageMedia = { type: 'image'; mediaId: MediaId };
export type VideoMedia = { type: 'video'; mediaId: MediaId };
export type MediaItem = ImageMedia | VideoMedia;

export const MediaItem = {
  coverImageId(items: MediaItem[]): MediaId | null {
    const img = items.find((i): i is ImageMedia => i.type === 'image');
    return img?.mediaId ?? null;
  },
  allIds(items: MediaItem[]): MediaId[] {
    return items.map((i) => i.mediaId);
  },
};
```

### A3. BaseInfoWidget — `src/kernel/domain/vo/widget.ts`

```typescript
// BEFORE
imageId: MediaId | null;
// AFTER
media: MediaItem[];
```

`OwnerWidget.avatarId: MediaId | null` — без изменений (аватар — не карусель).

---

## Часть B: Organization — добавить media карусель

### B1. Domain

- `entities/info-draft.entity.ts` — добавить `media: MediaItem[]`, обновить `create()`, `update()`
- `entities/info-publication.entity.ts` — добавить `media: MediaItem[]`
- `commands.ts` — `media: MediaItem[]` в Create/Update/AdminCreate
- `events.ts` — `media: MediaItem[]` во все info-события
- `entity.ts` — прокинуть `media` через все методы

### B2. Kernel integration events

- `src/kernel/domain/events/organization.events.ts` — добавить `media: MediaItem[]`
- `src/kernel/domain/events/item.events.ts` — подхватит автоматически через `ItemWidget[]`

### B3. Application (interactors)

- `create-organization.interactor.ts`, `update-info-draft.interactor.ts`, `admin-create-organization.interactor.ts` — `media` в команду
- `submit-info-for-moderation.interactor.ts`, `approve-info-moderation.interactor.ts` — прокинуть `media`
- Вызов `MediaService.useMedia()` / `freeMedia()` для файлов из карусели

### B4. Adapters

- HTTP controllers — парсить/сериализовать `media`
- `json-state.ts` — добавить `media` в JSON-тип
- Kafka publishers — включить `media` в outbox payload

---

## Часть C: Media feature — ренейм File → Media

### C1. Агрегат

Переименовать `aggregates/file/` → `aggregates/media/`:

| Было | Стало |
|------|-------|
| `FileState` | `MediaState` |
| `UploadFileCommand` | `UploadMediaCommand` |
| `UseFileCommand` | `UseMediaCommand` |
| `FreeFileCommand` | `FreeMediaCommand` |
| `file.uploaded` / `.used` / `.freed` | `media.uploaded` / `.used` / `.freed` |
| `fileDecide` / `fileApply` | `mediaDecide` / `mediaApply` |
| `File*Error` | `Media*Error` |

### C2. MediaState

```typescript
type MediaType = 'image' | 'video';

type MediaState = {
  id: MediaId;
  type: MediaType;
  name: string;
  bucket: string;
  mimeType: string;
  isTemporary: boolean;
  createdAt: Date;
};
```

`type` задаётся при создании (upload endpoint определяет тип).

### C3. DB — одна таблица `media` + `video_details`

```typescript
export const media = pgTable('media', {
  id: uuid('id').primaryKey(),
  type: text('type').notNull(),           // 'image' | 'video'
  name: text('name').notNull(),
  bucket: text('bucket').notNull(),
  mimeType: text('mime_type').notNull(),
  isTemporary: boolean('is_temporary').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
});

// Video-специфичные поля — отдельная таблица, заполняется в эпике 2
export const videoDetails = pgTable('video_details', {
  mediaId: uuid('media_id').primaryKey().references(() => media.id),
  processingStatus: text('processing_status').notNull(), // 'pending' | 'processing' | 'ready' | 'failed'
  thumbnailMediaId: uuid('thumbnail_media_id'),          // ссылка на media (image)
  hlsManifestKey: text('hls_manifest_key'),
  duration: integer('duration'),                          // секунды
});
```

### C4. Application ports

- `FileRepository` → `MediaRepository`
- `FileIdGenerator` → `MediaIdGenerator`
- `FileStorageService` — оставить общим (S3 логика одинаковая)

### C5. Interactors — ренейм `*file*` → `*media*`

Пока все interactors работают одинаково для image и video (upload, use, free). Различия появятся в эпике 2 (multipart upload для видео).

### C6. Repository

`DrizzleFileRepository` → `DrizzleMediaRepository`

### C7. HTTP endpoints

- `POST /media/upload-request` → `POST /media/image/upload-request` (создаёт media с `type: 'image'`)
- `GET /media/preview/:mediaId` — оставить общим (работает для любого типа)

Video upload endpoint — в эпике 2.

### C8. Kernel MediaService port

`src/kernel/application/ports/media.ts`:

```typescript
getDownloadUrl(mediaId: MediaId, options): Promise<string | null>
useMedia(tx, mediaIds: MediaId[]): Promise<void>
freeMedia(tx, mediaIds: MediaId[]): Promise<void>
```

### C9. Media module DI

Обновить `media.module.ts` — MediaRepository, обновленные interactors.

---

## Часть D: Discovery, Kafka, HTTP contracts

### D1. Kafka contracts

- `item.contract.ts` — BaseInfoWidget: `imageId` → `media` array (discriminated union)
- `organization.contract.ts` — добавить `media`
- `organization-moderation.contract.ts` — добавить `media`

### D2. HTTP contracts (OpenAPI YAML)

Новая shared-схема:
```yaml
ImageMedia:
  type: object
  required: [type, mediaId]
  properties:
    type: { type: string, enum: [image] }
    mediaId: { type: string }

VideoMedia:
  type: object
  required: [type, mediaId]
  properties:
    type: { type: string, enum: [video] }
    mediaId: { type: string }

MediaItem:
  oneOf:
    - $ref: "#/ImageMedia"
    - $ref: "#/VideoMedia"
  discriminator:
    propertyName: type
```

Обновить: discovery.yaml, organization.yaml, cms.yaml, request bodies, upload endpoint paths.

`yarn openapi`

### D3. Discovery

- Read models: `baseInfo.imageId` → `baseInfo.media: MediaItem[]`
- List view: derived cover через `MediaItem.coverImageId()`
- DB schema: `imageId` text → `media` jsonb
- Meilisearch: обновить sync/search
- Kafka handlers: маппить `media`
- Owner read model: добавить `media: MediaItem[]`

---

## Часть E: Финализация

- Удалить `drizzle/`, перегенерировать миграцию
- Обновить e2e тесты
- `ImageId` → `MediaId` по всей кодовой базе (второй ренейм)

## Verification

1. `yarn tsc --noEmit`
2. `yarn openapi`
3. E2e тесты для organization и items

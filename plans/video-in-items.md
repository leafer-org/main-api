# Эпик 2: Загрузка, обработка и воспроизведение видео

> Предыдущий эпик: [media-carousel.md](media-carousel.md) — единый MediaId, таблица `media` + `video_details`, карусель
>
> **Prereqs из эпика 1:** `MediaId`, `MediaState` с `type` discriminator, таблица `media`, пустая таблица `video_details`, `MediaItem` union, карусель `media: MediaItem[]` в items/org

## Context

Эпик 1 подготовил data layer: единый `MediaId`, таблица `media` с type discriminator, пустая `video_details`, карусель в items/organizations. Теперь нужно реализовать полный цикл видео: загрузку через S3 Multipart, обработку (HLS транскодирование, thumbnail), воспроизведение через CDN. Обработка запускается в отдельном процессе через новую точку входа.

---

## 1. Расширение Video домена

### VideoDetails — доменный тип

```typescript
type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

type VideoDetails = {
  mediaId: MediaId;
  processingStatus: ProcessingStatus;
  thumbnailMediaId: MediaId | null;  // ссылается на media с type='image'
  hlsManifestKey: string | null;
  duration: number | null;           // секунды
};
```

### Новые команды

К существующим `UploadMedia`, `UseMedia`, `FreeMedia` добавить video-специфичные:
- `InitiateVideoProcessing { mediaId }`
- `CompleteVideoProcessing { mediaId, thumbnailMediaId, hlsManifestKey, duration }`
- `FailVideoProcessing { mediaId, reason }`

### Новые события

- `video.processing-initiated`
- `video.processing-completed`
- `video.processing-failed`

### MimeType VO

`src/features/media/domain/vo/mime-type.ts` — добавить `isVideo()`.

---

## 2. Загрузка видео — S3 Multipart Upload

### Новые эндпоинты

| Endpoint | Описание |
|----------|----------|
| `POST /media/video/upload-init` | Создаёт media (type='video') + video_details (status='pending'), инициирует S3 multipart |
| `POST /media/video/upload-complete` | Завершает multipart upload, ставит job в очередь обработки |
| `GET /media/video/status/:mediaId` | Статус обработки |

### Flow

1. Mobile → `upload-init` (name, mimeType, fileSize)
2. Server валидирует mimeType (`video/*`), fileSize (≤500MB), создаёт media record + video_details, вызывает S3 `CreateMultipartUpload`, генерирует presigned PUT URLs (по 10MB)
3. Mobile загружает части параллельно напрямую в S3
4. Mobile → `upload-complete` (mediaId, uploadId, parts[])
5. Server вызывает S3 `CompleteMultipartUpload`, ставит job в BullMQ

### Новые методы в FileStorageService

```typescript
createMultipartUpload(bucket, key, mimeType): Promise<{ uploadId: string }>
getPresignedPartUrls(bucket, key, uploadId, partCount): Promise<string[]>
completeMultipartUpload(bucket, key, uploadId, parts: { partNumber, etag }[]): Promise<void>
```

### Новые интеракторы

- `InitVideoUploadInteractor` — валидация, создание media+video_details, multipart init
- `CompleteVideoUploadInteractor` — завершение upload, постановка в очередь

### Новый порт — VideoDetailsRepository

```typescript
abstract class VideoDetailsRepository {
  abstract findByMediaId(tx, mediaId: MediaId): Promise<VideoDetails | null>;
  abstract save(tx, details: VideoDetails): Promise<void>;
  abstract updateStatus(tx, mediaId: MediaId, status: ProcessingStatus): Promise<void>;
}
```

### HTTP contracts

Новые файлы в `http-contracts/endpoints/media/`:
- `media-video-upload-init.yaml`
- `media-video-upload-complete.yaml`
- `media-video-status.yaml`

---

## 3. Обработка видео — BullMQ + FFmpeg

### Почему BullMQ, а не Kafka

Транскодирование — долгая задача (минуты). BullMQ: retries, progress tracking, concurrency limits. Kafka — для интеграционных событий.

### Новая точка входа: `src/apps/file-processor.ts`

```
src/apps/
├── main.ts                      # API сервер (существующий)
├── app.module.ts                # Модуль API сервера (существующий)
├── file-processor.ts            # Точка входа обработки файлов (НОВЫЙ)
└── file-processor.module.ts     # Модуль обработки файлов (НОВЫЙ)
```

**`file-processor.module.ts`** — легковесный модуль:

```typescript
@Module({
  imports: [
    ClsModule.forRoot({ global: true }),
    MainConfigModule,
    MainDbModule,
    MainRedisModule,           // для BullMQ
    // НЕ подключаем: Kafka, Meilisearch, Gorse, Auth, HTTP controllers
    // НЕ подключаем: Discovery, IDP, CMS, Organization, Reviews, Tickets
    MediaModule.forProcessor(), // только Media aggregate, BullMQ worker, S3
  ],
})
export class FileProcessorModule {}
```

**`file-processor.ts`** — bootstrap без HTTP:

```typescript
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(FileProcessorModule);
  // graceful shutdown
}
```

**`MediaModule.forProcessor()`** — регистрирует:
- `MediaRepository`, `VideoDetailsRepository`
- `FileStorageService` (S3)
- `VideoTranscoder` (FFmpeg адаптер)
- BullMQ worker

**package.json:**
```json
"serve:file-processor": "node dist/apps/file-processor.js"
```

### Pipeline (один BullMQ job)

1. Скачать оригинал из S3 → локальный диск
2. `ffprobe` → duration, resolution, codecs
3. FFmpeg → HLS с адаптивным битрейтом:
   - 360p (800kbps), 720p (2500kbps), 1080p (5000kbps, если source ≥ 1080p)
   - AAC 128kbps, сегменты по 6с
4. Thumbnail: кадр на 2с → JPEG → создать media record (type='image') через `UploadMediaCommand`
5. Загрузить HLS в S3: `video/{mediaId}/master.m3u8`, `video/{mediaId}/360p/`, ...
6. `CompleteVideoProcessingCommand` → обновить video_details
7. Переместить оригинал temp → permanent
8. При ошибке: `FailVideoProcessingCommand`

### Новые порты

```typescript
abstract class VideoProcessingQueue {
  abstract enqueue(mediaId: MediaId, bucket: string): Promise<void>;
}

abstract class VideoTranscoder {
  abstract transcode(input: TranscodeInput): Promise<TranscodeOutput>;
}

type TranscodeInput = { localPath: string; outputDir: string };
type TranscodeOutput = {
  hlsManifestPath: string;
  thumbnailPath: string;
  duration: number;
  variants: { resolution: string; bitrate: number }[];
};
```

### Инфраструктура

- **Redis** — для BullMQ очереди (уже есть `MainRedisModule`)
- **FFmpeg** — бинарник в Docker-образе file-processor
- **Scratch disk** — `/tmp/video-processing/`, очистка после job

---

## 4. Воспроизведение

### URL-схема

HLS manifest: `{cdnUrl}/video/{mediaId}/master.m3u8`
Сегменты используют **относительные пути** → CDN-агностично.

### Расширение MediaService

```typescript
// В kernel MediaService port — добавить video-методы:
getVideoStreamInfo(mediaId: MediaId): Promise<VideoStreamInfo | null>
getVideoStatus(mediaId: MediaId): Promise<ProcessingStatus | null>

type VideoStreamInfo = {
  hlsUrl: string;
  thumbnailUrl: string | null;
  status: ProcessingStatus;
  duration: number | null;
};
```

Реализация в `MediaServiceAdapter` — джойнит `media` + `video_details`, строит HLS URL.

---

## 5. Discovery Projection

### Read Models

`ItemReadModel.baseInfo.media` — уже `MediaItem[]` из эпика 1. Для video элементов добавить:
- Резолв `VideoStreamInfo` в query layer через `MediaService`

### ItemListView / ItemDetailView

- `hasVideo: boolean` (для UI-бейджа)
- Video URLs резолвятся в query layer

### Gorse

Добавить label `media:video` для рекомендаций.

---

## 6. Модерация

**Items с видео в статусе `processing` НЕ могут быть отправлены на модерацию.**

В `SubmitForModerationInteractor`:
1. Извлечь все `VideoMedia` из карусели base-info виджета
2. Для каждого → `MediaService.getVideoStatus(mediaId)`
3. Если хоть одно не `ready` → `Left(VideoNotReadyForModerationError)`

---

## 7. Auto-Thumbnail

При `video.processing-completed`:
- Thumbnail уже создан как отдельный media record (type='image')
- `thumbnailMediaId` записан в `video_details`
- Клиент может добавить thumbnail в карусель или использовать как cover

---

## 8. Фазы реализации

| Фаза | Что делать |
|------|-----------|
| **1. Video domain** | VideoDetails тип. Новые команды/события обработки. `MimeType.isVideo()`. VideoDetailsRepository порт |
| **2. Upload** | S3 multipart в FileStorageService. Интеракторы Init/Complete. HTTP endpoints + OpenAPI |
| **3. File Processor** | Новая точка входа `src/apps/file-processor.ts`. `MediaModule.forProcessor()`. BullMQ. FFmpeg `VideoTranscoder`. Job handler |
| **4. Playback** | Расширение MediaService (getVideoStreamInfo). HLS URL resolution. Discovery projection |
| **5. Moderation** | Валидация video-readiness в SubmitForModeration |
| **6. Mobile & Admin** | expo-video плеер. Upload UI с прогрессом. Admin preview |

---

## 9. Ключевые файлы

| Файл | Изменение |
|------|-----------|
| `src/features/media/domain/aggregates/media/commands.ts` | 3 новые команды обработки |
| `src/features/media/domain/aggregates/media/events.ts` | 3 новых события обработки |
| `src/features/media/domain/vo/mime-type.ts` | `isVideo()` |
| `src/features/media/application/ports.ts` | VideoDetailsRepository, VideoProcessingQueue, VideoTranscoder, multipart методы |
| `src/features/media/adapters/db/schema.ts` | Заполнение `video_details` |
| `src/features/media/adapters/s3/s3-client.service.ts` | Multipart upload операции |
| `src/features/media/adapters/media/media-url.service.ts` | HLS URL resolution |
| `src/features/media/media.module.ts` | `forProcessor()` static method |
| `src/apps/file-processor.ts` | **НОВЫЙ** — точка входа |
| `src/apps/file-processor.module.ts` | **НОВЫЙ** — модуль |
| `src/kernel/application/ports/media.ts` | getVideoStreamInfo, getVideoStatus |
| `http-contracts/endpoints/media/` | 3 новых YAML файла |

## Verification

1. Unit-тесты: mediaDecide/mediaApply для команд обработки
2. E2E: загрузка видео → multipart → processing job → ready status
3. E2E: item с VideoMedia в карусели → submit moderation (blocked если processing) → approve
4. Интеграционный: BullMQ job → HLS output в S3 → thumbnail
5. File processor запускается: `yarn serve:file-processor`

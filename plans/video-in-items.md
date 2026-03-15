# Архитектурный план: Видео в Items

## Context

Сейчас items поддерживают только изображения (`imageId` в `BaseInfoWidget`). Нужно добавить поддержку видео — загрузку, серверную обработку (HLS транскодирование, thumbnail), воспроизведение через CDN. Видео добавляется как поле в существующий `BaseInfoWidget`, а не как отдельная сущность/виджет.

---

## 1. Расширение BaseInfoWidget

**Файл:** `src/kernel/domain/vo/widget.ts`

```typescript
export type BaseInfoWidget = {
  type: 'base-info';
  title: string;
  description: string;
  imageId: FileId | null;
  videoId: FileId | null;  // NEW
};
```

Если `videoId` есть, а `imageId` — нет, система автоматически подставит thumbnail из видео.

---

## 2. Расширение File Domain

**Файлы:** `src/features/media/domain/aggregates/file/`

### Новые поля в FileState (`state.ts`)
- `mediaCategory: 'image' | 'video' | 'other'`
- `processingStatus: 'pending' | 'processing' | 'ready' | 'failed' | null` (null для не-видео)
- `thumbnailFileId: FileId | null` — автосгенерированный кадр
- `hlsManifestKey: string | null` — S3 ключ master.m3u8

### Новые команды (`commands.ts`)
- `InitiateVideoProcessing`
- `CompleteVideoProcessing { thumbnailFileId, hlsManifestKey }`
- `FailVideoProcessing { reason }`

### Новые события (`events.ts`)
- `file.video-processing-initiated`
- `file.video-processing-completed`
- `file.video-processing-failed`

### DB Schema (`adapters/db/schema.ts`)
Добавить колонки: `media_category`, `processing_status`, `thumbnail_file_id`, `hls_manifest_key`.

---

## 3. Загрузка видео — S3 Multipart Upload

Видео может быть сотни МБ → текущий presigned POST не подходит. Нужен S3 Multipart Upload.

### Новые эндпоинты

| Endpoint | Описание |
|----------|----------|
| `POST /media/video-upload-init` | Создаёт File, инициирует S3 multipart upload, возвращает `{ fileId, uploadId, partUrls[], partSize }` |
| `POST /media/video-upload-complete` | Завершает multipart upload, ставит job в очередь обработки |
| `GET /media/video-status/:fileId` | Статус обработки: pending/processing/ready/failed |

### Flow
1. Mobile → `video-upload-init` (name, mimeType, fileSize)
2. Server валидирует mimeType (`video/*`), fileSize (≤500MB), создаёт File record, вызывает S3 `CreateMultipartUpload`, генерирует presigned PUT URLs для частей (по 10MB)
3. Mobile загружает части параллельно напрямую в S3
4. Mobile → `video-upload-complete` (fileId, uploadId, parts[])
5. Server вызывает S3 `CompleteMultipartUpload`, ставит job в BullMQ

### Новые методы в `FileStorageService` порт (`application/ports.ts`)
- `createMultipartUpload(bucket, key, mimeType)`
- `getPresignedPartUrls(bucket, key, uploadId, partCount)`
- `completeMultipartUpload(bucket, key, uploadId, parts[])`

### Новые интеракторы
- `InitVideoUploadInteractor`
- `CompleteVideoUploadInteractor`

---

## 4. Обработка видео — BullMQ + FFmpeg

### Почему BullMQ, а не Kafka
Транскодирование — долгая задача (минуты). BullMQ поддерживает retries, progress tracking, concurrency limits. Kafka — для интеграционных событий.

### Pipeline (один BullMQ job)
1. Скачать оригинал из S3 temp bucket → локальный диск
2. `ffprobe` → duration, resolution, codecs
3. FFmpeg → HLS с адаптивным битрейтом:
   - 360p (800kbps), 720p (2500kbps), 1080p (5000kbps, если source ≥ 1080p)
   - AAC 128kbps, сегменты по 6с
   - Выход: `master.m3u8` + `stream_N/playlist.m3u8` + `.ts` сегменты
4. Thumbnail: кадр на 2с (или 10% длительности) → JPEG → новый File record
5. Загрузить HLS в S3: `video/{fileId}/master.m3u8`, `video/{fileId}/360p/`, ...
6. `CompleteVideoProcessingCommand` → обновить состояние файла
7. Переместить оригинал temp → permanent
8. При ошибке: `FailVideoProcessingCommand`

### Инфраструктура
- **Redis** — для BullMQ очереди
- **FFmpeg** — бинарник в Docker-образе
- **Scratch disk** — `/tmp/video-processing/`, очистка после job

### Новые порты (`application/ports.ts`)
```
VideoProcessingQueue.enqueue(fileId, bucket)
VideoTranscoder.transcode({ bucket, key, outputBucket, outputPrefix }) → { hlsManifestKey, thumbnailBuffer }
```

### Деплой
Старт: in-process BullMQ worker внутри NestJS (через `@nestjs/bullmq`).
Масштабирование: вынести worker в отдельный контейнер.

---

## 5. Воспроизведение

### URL-схема
HLS manifest: `{cdnUrl}/video/{fileId}/master.m3u8`
Сегменты внутри manifest используют **относительные пути** → CDN-агностично.

### MediaUrlService (`adapters/media/media-url.service.ts`)
Новый метод: `getVideoStreamUrl(fileId)` → возвращает `{ hlsUrl, thumbnailUrl, status }`.

### Kernel MediaService port
```
getVideoStreamUrl(fileId: FileId): Promise<VideoStreamInfo | null>
```

---

## 6. Discovery Projection

### Schema (`features/discovery/adapters/db/schema.ts`)
Новые колонки в `discovery_items`: `video_id` (text), `video_status` (text).

### Read Model (`features/discovery/domain/read-models/`)
`ItemBaseInfo` → добавить `videoId`, `videoStatus`.

### Projection
`projectItemFromEvent` → извлекать `videoId` из base-info виджета.

### ItemListView / ItemDetailView
- `videoId: FileId | null`
- `hasVideo: boolean` (для UI-бейджа)
- `videoStreamUrl: string | null` (резолвится в query layer)

### Gorse
Добавить label `media:video` для рекомендаций.

---

## 7. Модерация

**Items с видео в статусе processing НЕ могут быть отправлены на модерацию.**

В `SubmitForModerationInteractor`:
1. Извлечь `videoId` из base-info виджета
2. Если `videoId` есть → проверить `MediaService.getVideoStatus(videoId)`
3. Если не `ready` → `Left(VideoNotReadyForModerationError)`

Редактирование черновика разрешено пока видео обрабатывается.

---

## 8. Auto-Thumbnail

При завершении обработки видео:
- Если item с этим `videoId` имеет `imageId: null` → автоматически подставить `thumbnailFileId`
- Обратная совместимость: старые клиенты видят preview-изображение

---

## 9. HTTP Contracts (OpenAPI)

### Новые файлы в `http-contracts/endpoints/media/`
- `media-video-upload-init.yaml`
- `media-video-upload-complete.yaml`
- `media-video-status.yaml`

### Обновить
- Shared widget schema → `videoId` в BaseInfoWidget
- Item detail response → `videoStreamUrl`, `hasVideo`

---

## 10. Фазы реализации

| Фаза | Что делать |
|------|-----------|
| **1. Foundation** | Расширить FileState, commands, events, decide, apply. Обновить DB schema. Добавить `videoId` в BaseInfoWidget. `MimeType.isVideo()` |
| **2. Upload** | S3 multipart в S3ClientService. Порты FileStorageService. Интеракторы Init/Complete. HTTP endpoints + OpenAPI |
| **3. Processing** | BullMQ + `@nestjs/bullmq`. Порт VideoProcessingQueue. FFmpeg VideoTranscoder адаптер. Job handler. Обновление file aggregate |
| **4. Playback & Discovery** | MediaUrlService → HLS URLs. Discovery schema + projection + queries. VideoStreamUrl в responses |
| **5. Moderation** | Валидация video-readiness в SubmitForModeration. Auto-thumbnail handler |
| **6. Mobile & Admin** | expo-video плеер. Upload UI с прогрессом. Admin preview |

---

## 11. Ключевые файлы

| Файл | Изменение |
|------|-----------|
| `src/kernel/domain/vo/widget.ts` | `videoId` в BaseInfoWidget |
| `src/features/media/domain/aggregates/file/state.ts` | mediaCategory, processingStatus, thumbnailFileId, hlsManifestKey |
| `src/features/media/domain/aggregates/file/commands.ts` | 3 новые команды |
| `src/features/media/domain/aggregates/file/events.ts` | 3 новых события |
| `src/features/media/domain/aggregates/file/decide.ts` | Новые case в fileDecide |
| `src/features/media/domain/aggregates/file/apply.ts` | Новые case в fileApply |
| `src/features/media/application/ports.ts` | VideoProcessingQueue, multipart методы |
| `src/features/media/adapters/db/schema.ts` | Новые колонки |
| `src/features/media/adapters/s3/s3-client.service.ts` | Multipart upload операции |
| `src/features/media/adapters/media/media-url.service.ts` | HLS URL resolution |
| `src/features/discovery/adapters/db/schema.ts` | video_id, video_status |
| `src/features/discovery/domain/read-models/item.read-model.ts` | videoId, videoStatus |
| `http-contracts/endpoints/media/` | 3 новых YAML файла |
| `http-contracts/shared/widget.yaml` | videoId в BaseInfoWidget schema |

---

## Verification

1. Unit-тесты: fileDecide/fileApply для новых команд/событий
2. E2E: загрузка видео → multipart → processing job → ready status
3. E2E: создание item с videoId → submit moderation (blocked если processing) → approve → discovery projection с videoStreamUrl
4. Интеграционный: BullMQ job с тестовым видео → HLS output в S3 → thumbnail генерация

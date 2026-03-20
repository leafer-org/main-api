# MP4-превью для автоплея видео в ленте

## Контекст

Видео в ленте должно автоматически воспроизводиться при скролле (muted, instant start). HLS имеет задержку старта 2-5 сек из-за загрузки манифеста + первого сегмента. Решение: генерировать легковесный MP4-превью (480p, без звука, до 30 сек, faststart) для мгновенного автоплея + сохранить HLS для полного просмотра.

## Изменения

### 1. Domain — VideoDetailsEntity state
**Файл:** `src/features/media/domain/aggregates/media/entities/video-details.entity.ts`
- Добавить поле `mp4PreviewKey: string | null` в тип `VideoDetailsEntity`
- В `create(mediaId)`: инициализировать `mp4PreviewKey: null`
- В `completeProcessing(state, cmd)`: записать `mp4PreviewKey: cmd.mp4PreviewKey`
- В `initiateProcessing(state)` и `failProcessing(state)`: сохранить текущее значение / `null`

### 2. Domain — Commands
**Файл:** `src/features/media/domain/aggregates/media/commands.ts`
- Добавить `mp4PreviewKey: string` в `CompleteVideoProcessingCommand`

### 3. Domain — Events
**Файл:** `src/features/media/domain/aggregates/media/events.ts`
- Добавить `mp4PreviewKey: string` в `VideoProcessingCompletedEvent`

### 4. Domain — MediaEntity
**Файл:** `src/features/media/domain/aggregates/media/entity.ts`
- В `completeProcessing(state, details, cmd)`: `mp4PreviewKey` прокидывается через `VideoDetailsEntity.completeProcessing` — убедиться что команда передаётся корректно

### 5. Domain — Unit Tests
**Файл:** `src/features/media/domain/aggregates/media/entity.spec.ts`
- Обновить тесты `completeProcessing` — добавить `mp4PreviewKey` в команду и проверить что он попадает в результат

### 6. DB Schema
**Файл:** `src/features/media/adapters/db/schema.ts`
- Добавить колонку `mp4PreviewKey: text('mp4_preview_key')` в таблицу `videoDetails`
- После изменения: удалить `drizzle/`, запустить `npx drizzle-kit generate`

### 7. DB Repository
**Файл:** `src/features/media/adapters/db/repositories/video-details.repository.ts`
- Добавить `mp4PreviewKey` в маппинг `findByMediaId` и `save` (upsert)

### 8. Application Ports — TranscodeOutput
**Файл:** `src/features/media/application/ports.ts`
- Добавить `mp4PreviewPath: string` в тип `TranscodeOutput`

### 9. Transcoder — генерация MP4-превью
**Файл:** `src/features/media/adapters/transcoder/ffmpeg-video-transcoder.ts`
- Добавить приватный метод `generateMp4Preview(inputPath, outputPath, duration)`:
  ```
  ffmpeg -i input -t 30 -vf scale=-2:480 -c:v libx264 -preset fast -crf 28 -an -movflags +faststart -y output
  ```
  - `-t 30` — макс 30 сек (или полное видео если короче)
  - `-vf scale=-2:480` — 480p с сохранением пропорций (-2 гарантирует чётную ширину)
  - `-an` — без звука (автоплей в ленте)
  - `-movflags +faststart` — moov atom в начале для мгновенного старта
  - `-crf 28` — приемлемое качество при малом размере
- Вызвать после `extractThumbnail`, перед HLS-транскодированием
- Добавить `mp4PreviewPath` в возвращаемый `TranscodeOutput`

### 10. Worker — прокидывание ключа
**Файл:** `src/features/media/adapters/queue/video-processing.worker.ts`
- `uploadDirectory` уже загружает всё из `outputDir` — `preview.mp4` попадёт в S3 как `video/{mediaId}/preview.mp4` автоматически
- Вычислить `mp4PreviewKey = \`video/${mediaId}/preview.mp4\``
- Передать `mp4PreviewKey` в команду `CompleteVideoProcessingCommand` при вызове `completeProcessing`

### 11. Kernel Port — VideoStreamInfo
**Файл:** `src/kernel/application/ports/media.ts`
- Добавить `mp4PreviewUrl: string | null` в тип `VideoStreamInfo`

### 12. Media Service Adapter
**Файл:** `src/features/media/adapters/media/media.service.ts`
- Добавить `buildMp4PreviewUrl(mp4PreviewKey: string | null)` — аналогично `buildHlsUrl`: `{S3_ENDPOINT}/{publicBucket}/${mp4PreviewKey}` (или CDN URL при наличии)
- В `getVideoStreamInfo`: вычислить `mp4PreviewUrl` из `details.mp4PreviewKey`, включить в ответ `VideoStreamInfo`

### 13. HTTP Contracts
**Файл:** `http-contracts/shared/media.yaml`
- Добавить `mp4PreviewUrl` (type: string, nullable: true, format: uri) в схему `VideoPreviewResult`
- Запустить `yarn openapi` для регенерации типов

### 14. GetVideoPreview Interactor
**Файл:** `src/features/media/application/use-cases/get-video-preview.interactor.ts`
- Добавить `mp4PreviewUrl: info.status === 'ready' ? info.mp4PreviewUrl : null` в ответ

### 15. Миграция
```bash
rm -rf drizzle/
npx drizzle-kit generate
```

## Верификация

1. Запустить `yarn openapi` — убедиться что `generated-public-schema.d.ts` содержит `mp4PreviewUrl`
2. Запустить `npx drizzle-kit generate` — проверить миграцию
3. Проверить компиляцию `npx tsc --noEmit`
4. Загрузить тестовое видео, убедиться что `GET /media/video/preview/:mediaId` возвращает `mp4PreviewUrl`

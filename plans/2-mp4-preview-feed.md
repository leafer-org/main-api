# MP4-превью для автоплея видео в ленте

## Контекст

Видео в ленте должно автоматически воспроизводиться при скролле (muted, instant start). HLS имеет задержку старта 2-5 сек из-за загрузки манифеста + первого сегмента. Решение: генерировать легковесный MP4-превью (480p, без звука, до 30 сек, faststart) для мгновенного автоплея + сохранить HLS для полного просмотра.

## Изменения

### 1. Domain — VideoDetails state
**Файл:** `src/features/media/domain/aggregates/media/video-details.ts`
- Добавить поле `mp4PreviewKey: string | null`

### 2. Domain — Commands
**Файл:** `src/features/media/domain/aggregates/media/commands.ts`
- Добавить `mp4PreviewKey: string` в `CompleteVideoProcessingCommand`

### 3. Domain — Events
**Файл:** `src/features/media/domain/aggregates/media/events.ts`
- Добавить `mp4PreviewKey: string` в `VideoProcessingCompletedEvent`

### 4. Domain — Decide
**Файл:** `src/features/media/domain/aggregates/media/decide.ts`
- Прокинуть `mp4PreviewKey` из команды в событие в ветке `CompleteVideoProcessing`

### 5. Domain — Apply
**Файл:** `src/features/media/domain/aggregates/media/apply.ts`
- В `videoDetailsApply` добавить `mp4PreviewKey` во все ветки обработки video-событий:
  - `processing-initiated`: `mp4PreviewKey: null`
  - `processing-completed`: `mp4PreviewKey: event.mp4PreviewKey`
  - `processing-failed`: сохранить текущее значение

### 6. DB Schema
**Файл:** `src/features/media/adapters/db/schema.ts`
- Добавить колонку `mp4PreviewKey: text('mp4_preview_key')` в таблицу `videoDetails`
- После изменения: удалить `drizzle/`, запустить `npx drizzle-kit generate`

### 7. DB Repository
**Файл:** `src/features/media/adapters/db/repositories/video-details.repository.ts`
- Добавить `mp4PreviewKey` в маппинг `findByMediaId` и `save`

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
- Добавить `mp4PreviewPath` в возвращаемый объект

### 10. Worker — прокидывание ключа
**Файл:** `src/features/media/adapters/queue/video-processing.worker.ts`
- `uploadDirectory` уже загружает всё из `outputDir` → `preview.mp4` попадает в S3 как `video/{mediaId}/preview.mp4` автоматически
- Вычислить `mp4PreviewKey = \`${hlsPrefix}/preview.mp4\``
- Передать `mp4PreviewKey` в `completeProcessing`
- Обновить сигнатуру `completeProcessing` и команду `CompleteVideoProcessing`

### 11. Kernel Port — VideoStreamInfo
**Файл:** `src/kernel/application/ports/media.ts`
- Добавить `mp4PreviewUrl: string | null` в тип `VideoStreamInfo`

### 12. Media Service Adapter
**Файл:** `src/features/media/adapters/media/media.service.ts`
- Добавить `buildMp4PreviewUrl(mp4PreviewKey)` — аналогично `buildHlsUrl`, конструирует URL из `s3PublicUrl + bucket + key`
- В `getVideoStreamInfo`: вызвать `buildMp4PreviewUrl(details.mp4PreviewKey)`, включить в ответ

### 13. HTTP Contracts
**Файл:** `http-contracts/shared/media.yaml`
- Добавить `mp4PreviewUrl` (type: string | null, format: uri) в `VideoPreviewResult`
- Запустить `yarn openapi` для регенерации

### 14. Preview Interactor
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
4. Загрузить тестовое видео, убедиться что в `/media/video/preview/:mediaId` возвращается `mp4PreviewUrl`

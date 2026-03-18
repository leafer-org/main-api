# Module Registration

Все адаптеры регистрируются в feature module через `{ provide: Port, useClass: Adapter }`.

## Пример

```ts
@Global()
@Module({
  controllers: [AuthController, MeController, RolesController],
  providers: [
    // Adapters: Port -> Adapter
    { provide: LoginProcessRepository, useClass: DrizzleLoginProcessRepository },
    { provide: UserRepository, useClass: DrizzleUserRepository },
    { provide: SessionRepository, useClass: DrizzleSessionRepository },
    { provide: MeQueryPort, useClass: DrizzleMeQuery },
    { provide: JwtAccessService, useClass: NestJwtAccessService },
    { provide: OtpGeneratorService, useClass: CryptoOtpGenerator },
    { provide: IdGenerator, useClass: UuidIdGenerator },
    { provide: Clock, useClass: SystemClock },
    { provide: UserEventPublisher, useClass: OutboxUserEventPublisher },
    // Use cases
    CreateOtpInteractor,
    VerifyOtpInteractor,
    RegisterInteractor,
    GetMeInteractor,
    GetUserSessionsInteractor,
  ],
  exports: [SessionValidationPort],
})
export class IdpModule {}
```

## Разделение модулей (основной + процессор)

Если feature содержит фоновую обработку (BullMQ worker, FFmpeg и т.д.), разделяй на два модуля:

```ts
// media.module.ts — основной модуль (HTTP, DB, URLs)
@Global()
@Module({
  controllers: [MediaController],
  providers: [
    { provide: MediaRepository, useClass: DrizzleMediaRepository },
    { provide: VideoDetailsRepository, useClass: DrizzleVideoDetailsRepository },
    { provide: FileStorageService, useClass: S3FileStorageService },
    { provide: VideoProcessingQueue, useClass: BullMQVideoProcessingQueue },
    { provide: VideoProcessingProgress, useClass: RedisVideoProcessingProgress },
    { provide: MediaIdGenerator, useClass: UuidMediaIdGenerator },
    { provide: MediaService, useClass: MediaServiceAdapter },  // kernel port
    CachedMediaUrlService,
    // ...interactors
  ],
  exports: [MediaService],  // экспорт kernel-порта для других feature
})
export class MediaModule {}

// media-processor.module.ts — фоновый процессор (Worker + FFmpeg)
@Global()
@Module({
  providers: [
    VideoProcessingWorker,  // BullMQ worker (OnModuleInit/OnModuleDestroy)
    { provide: VideoTranscoder, useClass: FFmpegVideoTranscoder },
    // ...shared repos, storage, config
  ],
})
export class MediaProcessorModule {}
```

**Зачем**: Worker зависит от FFmpeg, BullMQ Worker и тяжёлых зависимостей. Разделение позволяет запускать процессор отдельно (как микросервис) или отключать при тестировании.

---

## Чек-лист нового адаптера

1. `@Injectable()` декоратор
2. Реализует абстрактный порт (`implements` или `extends`)
3. Зарегистрирован в module: `{ provide: Port, useClass: Adapter }`
4. Repository: инъектирует `TransactionHostPg`, использует `txHost.get(tx)`
5. Query: инъектирует `DatabaseClient`, работает без транзакций
6. Controller: маппит `Either` -> HTTP responses через `domainToHttpError`
7. Kafka publisher: использует `OutboxService.enqueue()` в транзакции

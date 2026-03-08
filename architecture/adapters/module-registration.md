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

## Чек-лист нового адаптера

1. `@Injectable()` декоратор
2. Реализует абстрактный порт (`implements` или `extends`)
3. Зарегистрирован в module: `{ provide: Port, useClass: Adapter }`
4. Repository: инъектирует `TransactionHostPg`, использует `txHost.get(tx)`
5. Query: инъектирует `DatabaseClient`, работает без транзакций
6. Controller: маппит `Either` -> HTTP responses через `domainToHttpError`
7. Kafka publisher: использует `OutboxService.enqueue()` в транзакции

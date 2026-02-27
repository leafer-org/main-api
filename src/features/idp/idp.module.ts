import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { DrizzleLoginProcessRepository } from './adapters/db/login-process.repository.js';
import { DrizzleMeQuery } from './adapters/db/me.query.js';
import { DrizzleSessionRepository } from './adapters/db/session.repository.js';
import { DrizzleUserRepository } from './adapters/db/user.repository.js';
import { DrizzleUserSessionsQuery } from './adapters/db/user-sessions.query.js';
import { UuidIdGenerator } from './adapters/id/id-generator.service.js';
import { NestJwtAccessService } from './adapters/jwt/jwt-access.service.js';
import { NestJwtRefreshTokenService } from './adapters/jwt/refresh-token.service.js';
import { CryptoOtpGenerator } from './adapters/otp/otp-generator.service.js';
import { MockOtpSender } from './adapters/otp/otp-sender.service.js';
import {
  IdGenerator,
  JwtAccessService,
  LoginProcessRepository,
  MeQueryPort,
  OtpGeneratorService,
  OtpSenderService,
  RefreshTokenService,
  SessionRepository,
  UserRepository,
  UserSessionsQueryPort,
} from './application/ports.js';
import { GetMeInteractor } from './application/queries/me/get-me.interactor.js';
import { GetUserSessionsInteractor } from './application/queries/user-sessions/get-user-sessions.interactor.js';
import { UpdateProfileInteractor } from './application/use-cases/manage-profile/update-profile.interactor.js';
import { CreateOtpInteractor } from './application/use-cases/otp-flow/create-otp.interactor.js';
import { RegisterInteractor } from './application/use-cases/otp-flow/register.interactor.js';
import { VerifyOtpInteractor } from './application/use-cases/otp-flow/verify-otp.interactor.js';
import { DeleteSessionInteractor } from './application/use-cases/session/delete-session.interactor.js';
import { RotateSessionInteractor } from './application/use-cases/session/rotate-session.interactor.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { MainDbModule } from '@/infra/db/module.js';

@Module({
  imports: [
    MainDbModule,
    MainConfigModule,
    JwtModule.registerAsync({
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        secret: config.get('IDP_JWT_SECRET'),
        signOptions: { expiresIn: config.get('IDP_ACCESS_TOKEN_TTL_SEC') as never },
      }),
      inject: [MainConfigService],
    }),
  ],
  providers: [
    // Adapters
    { provide: LoginProcessRepository, useClass: DrizzleLoginProcessRepository },
    { provide: UserRepository, useClass: DrizzleUserRepository },
    { provide: SessionRepository, useClass: DrizzleSessionRepository },
    { provide: MeQueryPort, useClass: DrizzleMeQuery },
    { provide: UserSessionsQueryPort, useClass: DrizzleUserSessionsQuery },
    { provide: JwtAccessService, useClass: NestJwtAccessService },
    { provide: RefreshTokenService, useClass: NestJwtRefreshTokenService },
    { provide: OtpGeneratorService, useClass: CryptoOtpGenerator },
    { provide: OtpSenderService, useClass: MockOtpSender },
    { provide: IdGenerator, useClass: UuidIdGenerator },
    // Use cases
    CreateOtpInteractor,
    VerifyOtpInteractor,
    RegisterInteractor,
    UpdateProfileInteractor,
    RotateSessionInteractor,
    DeleteSessionInteractor,
    // Queries
    GetMeInteractor,
    GetUserSessionsInteractor,
  ],
})
export class IdpModule {}

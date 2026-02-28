import { Global, Module } from '@nestjs/common';

import { DrizzleLoginProcessRepository } from './adapters/db/login-process.repository.js';
import { DrizzleMeQuery } from './adapters/db/me.query.js';
import { DrizzleRoleQuery } from './adapters/db/role.query.js';
import { DrizzleRoleRepository } from './adapters/db/role.repository.js';
import { DrizzleRolesListQuery } from './adapters/db/roles-list.query.js';
import { DrizzleSessionRepository } from './adapters/db/session.repository.js';
import { DrizzleSessionValidation } from './adapters/db/session-validation.adapter.js';
import { DrizzleUserRepository } from './adapters/db/user.repository.js';
import { DrizzleUserSessionsQuery } from './adapters/db/user-sessions.query.js';
import { AuthController } from './adapters/http/auth.controller.js';
import { MeController } from './adapters/http/me.controller.js';
import { RolesController, UsersRoleController } from './adapters/http/roles.controller.js';
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
  RoleQueryPort,
  RoleRepository,
  RolesListQueryPort,
  SessionRepository,
  UserRepository,
  UserSessionsQueryPort,
} from './application/ports.js';
import { GetMeInteractor } from './application/queries/me/get-me.interactor.js';
import { GetPermissionsSchemaInteractor } from './application/queries/roles/get-permissions-schema.interactor.js';
import { GetRoleInteractor } from './application/queries/roles/get-role.interactor.js';
import { GetRolesListInteractor } from './application/queries/roles/get-roles-list.interactor.js';
import { GetUserSessionsInteractor } from './application/queries/user-sessions/get-user-sessions.interactor.js';
import { UpdateProfileInteractor } from './application/use-cases/manage-profile/update-profile.interactor.js';
import { CreateOtpInteractor } from './application/use-cases/otp-flow/create-otp.interactor.js';
import { RegisterInteractor } from './application/use-cases/otp-flow/register.interactor.js';
import { VerifyOtpInteractor } from './application/use-cases/otp-flow/verify-otp.interactor.js';
import { CreateRoleInteractor } from './application/use-cases/roles/create-role.interactor.js';
import { DeleteRoleInteractor } from './application/use-cases/roles/delete-role.interactor.js';
import { UpdateRoleInteractor } from './application/use-cases/roles/update-role.interactor.js';
import { UpdateUserRoleInteractor } from './application/use-cases/roles/update-user-role.interactor.js';
import { DeleteAllSessionsInteractor } from './application/use-cases/session/delete-all-sessions.interactor.js';
import { DeleteSessionInteractor } from './application/use-cases/session/delete-session.interactor.js';
import { RotateSessionInteractor } from './application/use-cases/session/rotate-session.interactor.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';
import { SessionValidationPort } from '@/kernel/application/ports/session-validation.js';

@Global()
@Module({
  imports: [MainConfigModule],
  controllers: [AuthController, MeController, RolesController, UsersRoleController],
  providers: [
    // Adapters
    { provide: LoginProcessRepository, useClass: DrizzleLoginProcessRepository },
    { provide: UserRepository, useClass: DrizzleUserRepository },
    { provide: SessionRepository, useClass: DrizzleSessionRepository },
    { provide: RoleRepository, useClass: DrizzleRoleRepository },
    { provide: SessionValidationPort, useClass: DrizzleSessionValidation },
    { provide: MeQueryPort, useClass: DrizzleMeQuery },
    { provide: UserSessionsQueryPort, useClass: DrizzleUserSessionsQuery },
    { provide: RoleQueryPort, useClass: DrizzleRoleQuery },
    { provide: RolesListQueryPort, useClass: DrizzleRolesListQuery },
    { provide: JwtAccessService, useClass: NestJwtAccessService },
    { provide: RefreshTokenService, useClass: NestJwtRefreshTokenService },
    { provide: OtpGeneratorService, useClass: CryptoOtpGenerator },
    { provide: OtpSenderService, useClass: MockOtpSender },
    { provide: IdGenerator, useClass: UuidIdGenerator },
    { provide: Clock, useClass: SystemClock },
    // Use cases
    CreateOtpInteractor,
    VerifyOtpInteractor,
    RegisterInteractor,
    UpdateProfileInteractor,
    RotateSessionInteractor,
    DeleteSessionInteractor,
    DeleteAllSessionsInteractor,
    CreateRoleInteractor,
    UpdateRoleInteractor,
    DeleteRoleInteractor,
    UpdateUserRoleInteractor,
    // Queries
    GetMeInteractor,
    GetUserSessionsInteractor,
    GetRoleInteractor,
    GetRolesListInteractor,
    GetPermissionsSchemaInteractor,
  ],
  exports: [SessionValidationPort],
})
export class IdpModule {}

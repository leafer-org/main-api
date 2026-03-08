import { Global, Module } from '@nestjs/common';

import { DrizzleMeQuery } from './adapters/db/queries/me.query.js';
import { DrizzleRoleQuery } from './adapters/db/queries/role.query.js';
import { DrizzleRolesListQuery } from './adapters/db/queries/roles-list.query.js';
import { DrizzleUserSessionsQuery } from './adapters/db/queries/user-sessions.query.js';
import { DrizzleLoginProcessRepository } from './adapters/db/repositories/login-process.repository.js';
import { DrizzleRoleRepository } from './adapters/db/repositories/role.repository.js';
import { DrizzleSessionRepository } from './adapters/db/repositories/session.repository.js';
import { DrizzleSessionValidation } from './adapters/db/repositories/session-validation.adapter.js';
import { DrizzleUserRepository } from './adapters/db/repositories/user.repository.js';
import { AdminUsersController } from './adapters/http/admin-users.controller.js';
import { AuthController } from './adapters/http/auth.controller.js';
import { MeController } from './adapters/http/me.controller.js';
import { RolesController, UsersRoleController } from './adapters/http/roles.controller.js';
import { UuidIdGenerator } from './adapters/id/id-generator.service.js';
import { NestJwtAccessService } from './adapters/jwt/jwt-access.service.js';
import { NestJwtRefreshTokenService } from './adapters/jwt/refresh-token.service.js';
import { UserEventsProjectionHandler } from './adapters/kafka/user-events-projection.handler.js';
import { CryptoOtpGenerator } from './adapters/otp/otp-generator.service.js';
import { MockOtpSender } from './adapters/otp/otp-sender.service.js';
import { MeiliAdminUsersListQuery } from './adapters/search/admin-users-list.query.js';
import { MeiliAdminUsersListRepository } from './adapters/search/admin-users-list.repository.js';
import {
  AdminUsersListQueryPort,
  AdminUsersListRepository,
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
import { OnUserEventHandler } from './application/use-cases/admin-users-list/on-user-event.handler.js';
import { SearchAdminUsersInteractor } from './application/use-cases/admin-users-list/search-admin-users.interactor.js';
import { UpdateProfileInteractor } from './application/use-cases/manage-profile/update-profile.interactor.js';
import { GetMeInteractor } from './application/use-cases/me/get-me.interactor.js';
import { CreateOtpInteractor } from './application/use-cases/otp-flow/create-otp.interactor.js';
import { RegisterInteractor } from './application/use-cases/otp-flow/register.interactor.js';
import { VerifyOtpInteractor } from './application/use-cases/otp-flow/verify-otp.interactor.js';
import { CreateRoleInteractor } from './application/use-cases/roles/create-role.interactor.js';
import { DeleteRoleInteractor } from './application/use-cases/roles/delete-role.interactor.js';
import { GetPermissionsSchemaInteractor } from './application/use-cases/roles/get-permissions-schema.interactor.js';
import { GetRoleInteractor } from './application/use-cases/roles/get-role.interactor.js';
import { GetRolesListInteractor } from './application/use-cases/roles/get-roles-list.interactor.js';
import { UpdateRoleInteractor } from './application/use-cases/roles/update-role.interactor.js';
import { UpdateUserRoleInteractor } from './application/use-cases/roles/update-user-role.interactor.js';
import { DeleteAllSessionsInteractor } from './application/use-cases/session/delete-all-sessions.interactor.js';
import { DeleteSessionInteractor } from './application/use-cases/session/delete-session.interactor.js';
import { RotateSessionInteractor } from './application/use-cases/session/rotate-session.interactor.js';
import { GetUserSessionsInteractor } from './application/use-cases/user-sessions/get-user-sessions.interactor.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';
import { SessionValidationPort } from '@/kernel/application/ports/session-validation.js';

@Global()
@Module({
  imports: [MainConfigModule],
  controllers: [
    AuthController,
    MeController,
    RolesController,
    UsersRoleController,
    AdminUsersController,
  ],
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
    { provide: AdminUsersListRepository, useClass: MeiliAdminUsersListRepository },
    { provide: AdminUsersListQueryPort, useClass: MeiliAdminUsersListQuery },
    { provide: JwtAccessService, useClass: NestJwtAccessService },
    { provide: RefreshTokenService, useClass: NestJwtRefreshTokenService },
    { provide: OtpGeneratorService, useClass: CryptoOtpGenerator },
    { provide: OtpSenderService, useClass: MockOtpSender },
    { provide: IdGenerator, useClass: UuidIdGenerator },
    { provide: Clock, useClass: SystemClock },
    // Event handlers
    OnUserEventHandler,
    UserEventsProjectionHandler,
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
    GetMeInteractor,
    GetUserSessionsInteractor,
    GetRoleInteractor,
    GetRolesListInteractor,
    GetPermissionsSchemaInteractor,
    SearchAdminUsersInteractor,
  ],
  exports: [SessionValidationPort],
})
export class IdpModule {}

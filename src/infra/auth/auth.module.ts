import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AlsSessionContext } from './als-session-context.js';
import { DynamicPermissionsStore } from './dynamic-permissions-store.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtSessionStorage } from './jwt-session.storage.js';
import { PermissionCheckServiceImpl } from './permission-check.service.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { PermissionGuard } from '@/infra/lib/authorization/permission.guard.js';
import { PermissionService } from '@/infra/lib/authorization/permission-service.js';
import { PermissionsStore } from '@/infra/lib/authorization/permissions-store.js';
import { SessionContext } from '@/infra/lib/authorization/session-context.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';

@Global()
@Module({
  imports: [
    MainConfigModule,
    JwtModule.registerAsync({
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        secret: config.get('IDP_JWT_SECRET'),
        signOptions: { expiresIn: config.get('IDP_ACCESS_TOKEN_TTL_SEC') },
      }),
      inject: [MainConfigService],
    }),
  ],
  providers: [
    JwtSessionStorage,
    JwtAuthGuard,
    { provide: SessionContext, useClass: AlsSessionContext },
    { provide: PermissionsStore, useClass: DynamicPermissionsStore },
    PermissionService,
    PermissionGuard,
    { provide: PermissionCheckService, useClass: PermissionCheckServiceImpl },
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    JwtSessionStorage,
    PermissionGuard,
    PermissionService,
    PermissionCheckService,
    SessionContext,
    PermissionsStore,
  ],
})
export class AuthModule {}

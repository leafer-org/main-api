import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from './authn/jwt-auth.guard.js';
import { DynamicPermissionsStore } from './authz/dynamic-permissions-store.js';
import { PermissionCheckServiceImpl } from './authz/permission-check.service.js';
import { PermissionService } from './authz/permission-service.js';
import { PermissionsStore } from './authz/permissions-store.js';
import { AlsSessionContext } from './session/als-session-context.js';
import { SessionContext } from './session/session-context.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
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
    JwtAuthGuard,
    { provide: SessionContext, useClass: AlsSessionContext },
    {
      provide: PermissionsStore,
      useFactory: async (txHost: TransactionHostPg) => {
        const store = new DynamicPermissionsStore(txHost);
        await store.refresh();
        return store;
      },
      inject: [TransactionHostPg],
    },
    PermissionService,
    { provide: PermissionCheckService, useClass: PermissionCheckServiceImpl },
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    PermissionService,
    PermissionCheckService,
    SessionContext,
    PermissionsStore,
  ],
})
export class AuthModule {}

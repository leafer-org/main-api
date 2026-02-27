import { ConfigurableModuleBuilder, Module } from '@nestjs/common';

import { PermissionGuard } from './permission.guard.js';
import { PermissionService } from './permission-service.js';
import { PermissionsStore } from './permissions-store.js';
import { SessionContext } from './session-context.js';

type AuthorizationConfigModuleOptions = {
  permissionsStore: PermissionsStore;
  sessionContext: SessionContext;
};

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<AuthorizationConfigModuleOptions>()
    .setExtras(
      {
        isGlobal: false,
      },
      (definition, extras) => ({ ...definition, global: extras.isGlobal }),
    )
    .build();

export { MODULE_OPTIONS_TOKEN };

@Module({
  providers: [
    {
      provide: PermissionsStore,
      useFactory: (options: AuthorizationConfigModuleOptions) => options.permissionsStore,
      inject: [MODULE_OPTIONS_TOKEN],
    },
    {
      provide: SessionContext,
      useFactory: (options: AuthorizationConfigModuleOptions) => options.sessionContext,
      inject: [MODULE_OPTIONS_TOKEN],
    },
    PermissionService,
    PermissionGuard,
  ],
  exports: [PermissionService, PermissionGuard, PermissionsStore, SessionContext],
})
export class AuthorizationModule extends ConfigurableModuleClass {}

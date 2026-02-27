import type { DotenvConfigOptions } from '@dotenvx/dotenvx';
import { ConfigurableModuleBuilder, Module } from '@nestjs/common';

import type { CreateConfigService } from './create-config-service.js';

export type ConfigModuleOptions = {
  dotenv?: DotenvConfigOptions;
};

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>()
    .setExtras(
      {
        isGlobal: true,
        ConfigService: null as ReturnType<typeof CreateConfigService> | null,
      },
      (definition, extras) => {
        const providers = definition.providers ?? [];
        const exports = definition.exports ?? [];

        if (extras.ConfigService) {
          providers.push(extras.ConfigService);
          exports.push(extras.ConfigService);
        }

        return { ...definition, providers, exports, global: extras.isGlobal };
      },
    )
    .build();

export { MODULE_OPTIONS_TOKEN };

@Module({})
export class ConfigModule extends ConfigurableModuleClass {}

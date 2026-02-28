import { config } from '@dotenvx/dotenvx';
import { Inject, Injectable } from '@nestjs/common';
import Type from 'typebox';
import Value from 'typebox/value';

import { type ConfigModuleOptions, MODULE_OPTIONS_TOKEN } from './config-module.js';
import { ConfigValidationError } from './config-validation-error.js';

export function CreateConfigService<T extends Type.TProperties>(schema: T) {
  @Injectable()
  class ConfigService {
    public env: Type.Static<typeof Type.Object<T>>;

    public constructor(@Inject(MODULE_OPTIONS_TOKEN) options: ConfigModuleOptions) {
      const ConfigSchema = Type.Object(schema);

      config(options.dotenv ?? { convention: 'nextjs' });

      try {
        this.env = Value.Decode(ConfigSchema, process.env);
      } catch (e) {
        throw new ConfigValidationError(ConfigSchema, process.env, { cause: e });
      }
    }

    public get<K extends keyof T>(key: K) {
      const anyEnv = this.env as Record<K, unknown>;
      return anyEnv[key] as Type.StaticDecode<T[K]>;
    }
  }

  return ConfigService;
}

import { ConfigurableModuleBuilder } from '@nestjs/common';

export type RedisModuleOptions = {
  url: string;
};

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<RedisModuleOptions>().build();

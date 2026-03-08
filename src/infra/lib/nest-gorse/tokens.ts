import { ConfigurableModuleBuilder } from '@nestjs/common';

export type GorseModuleOptions = {
  url: string;
  apiKey: string;
};

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<GorseModuleOptions>().build();

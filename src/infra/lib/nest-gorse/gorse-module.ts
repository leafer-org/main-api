import { Module } from '@nestjs/common';

import { GorseClient } from './gorse-client.js';
import { ConfigurableModuleClass } from './tokens.js';

export type { GorseModuleOptions } from './tokens.js';

@Module({
  providers: [GorseClient],
  exports: [GorseClient],
})
export class GorseModule extends ConfigurableModuleClass {}

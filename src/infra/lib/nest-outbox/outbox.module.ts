import { Module } from '@nestjs/common';

import { ConfigurableModuleClass } from './outbox.module-definitions.js';
import { OutboxService } from './outbox.service.js';

@Module({
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule extends ConfigurableModuleClass {}

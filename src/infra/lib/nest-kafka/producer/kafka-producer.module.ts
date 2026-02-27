import { Module } from '@nestjs/common';

import { ConfigurableModuleClass } from './kafka-producer.module-definitions.js';
import { KafkaProducerService } from './kafka-producer.service.js';

@Module({
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaProducerModule extends ConfigurableModuleClass {}

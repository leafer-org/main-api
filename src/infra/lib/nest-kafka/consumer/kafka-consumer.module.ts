import { Module } from '@nestjs/common';

import { ConfigurableModuleClass } from './kafka-consumer.module-definitions.js';

@Module({})
export class KafkaConsumerModule extends ConfigurableModuleClass {}

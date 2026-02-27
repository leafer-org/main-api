import { ConfigurableModuleBuilder } from '@nestjs/common';

import type { KafkaProducerModuleOptions } from './kafka-producer.options.js';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<KafkaProducerModuleOptions>()
    .setExtras({ isGlobal: false }, (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
    }))
    .build();

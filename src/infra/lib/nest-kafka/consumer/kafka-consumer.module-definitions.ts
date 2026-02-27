/** biome-ignore-all lint/suspicious/noExplicitAny: default nest typing */
import {
  ConfigurableModuleBuilder,
  type DynamicModule,
  type ForwardReference,
  type Type,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import type { ConsumerId } from './consumer-id.js';
import { HandlerDiscovery } from './handler/handler-discovery.js';
import type { ConsumerMode, KafkaConsumerModuleOptions } from './kafka-consumer.options.js';
import { KafkaConsumerService } from './kafka-consumer.service.js';
import { CONSUMER_ID_TOKEN, CONSUMER_MODE_TOKEN } from './tokens.js';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } =
  new ConfigurableModuleBuilder<KafkaConsumerModuleOptions>()
    .setExtras<{
      imports?: Array<Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference>;
      consumerId: ConsumerId;
      mode?: ConsumerMode;
    }>({ consumerId: Symbol('default') }, (definition, extras) => {
      const imports = definition.imports ?? [];
      const providers = definition.providers ?? [];
      const exports = definition.exports ?? [];

      if (extras.imports) {
        imports.push(...extras.imports);
      }

      imports.push(DiscoveryModule);

      providers.push(
        {
          provide: CONSUMER_ID_TOKEN,
          useValue: extras.consumerId,
        },
        {
          provide: CONSUMER_MODE_TOKEN,
          useValue: extras.mode ?? { type: 'single' },
        },
        HandlerDiscovery,
        KafkaConsumerService,
      );

      return { ...definition, imports, providers, exports };
    })
    .build();

import { Module } from '@nestjs/common';

import { DiscoveryModule } from '../features/discovery/discovery.module.js';
import { IdpModule } from '../features/idp/idp.module.js';
import { MediaModule } from '../features/media/media.module.js';
import { MainDbModule } from './db.module.js';
import { MainSearchModule } from './search.module.js';
import { AuthModule } from '@/infra/auth/auth.module.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { KafkaProducerModule } from '@/infra/lib/nest-kafka/producer/kafka-producer.module.js';
import { OutboxModule } from '@/infra/lib/nest-outbox/outbox.module.js';
import { OutboxRelayModule } from '@/infra/lib/nest-outbox/outbox-relay.module.js';

@Module({
  imports: [
    MainDbModule,
    MainSearchModule,
    MainConfigModule,
    AuthModule,
    OutboxModule.register({ isGlobal: true }),
    KafkaProducerModule.registerAsync({
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        producerConfig: {
          'metadata.broker.list': config.get('KAFKA_BROKER'),
          'security.protocol': 'sasl_plaintext',
          'sasl.mechanisms': 'PLAIN',
          'sasl.username': config.get('KAFKA_SASL_USERNAME'),
          'sasl.password': config.get('KAFKA_SASL_PASSWORD'),
          dr_cb: true,
        },
      }),
      inject: [MainConfigService],
    }),
    OutboxRelayModule,
    IdpModule,
    MediaModule,
    DiscoveryModule,
  ],
})
export class AppModule {}

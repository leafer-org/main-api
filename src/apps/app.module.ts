import { Module } from '@nestjs/common';

import { DiscoveryModule } from '../features/discovery/discovery.module.js';
import { IDP_CONSUMER_ID } from '../features/idp/adapters/kafka/consumer-ids.js';
import { IdpModule } from '../features/idp/idp.module.js';
import { MediaModule } from '../features/media/media.module.js';
import { MainDbModule } from './db.module.js';
import { MainSearchModule } from './search.module.js';
import { AuthModule } from '@/infra/auth/auth.module.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { KafkaConsumerModule } from '@/infra/lib/nest-kafka/index.js';
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
      isGlobal: true,
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        producerConfig: {
          'metadata.broker.list': config.get('KAFKA_BROKER'),
          dr_cb: true,
        },
      }),
      inject: [MainConfigService],
    }),
    KafkaConsumerModule.registerAsync({
      consumerId: IDP_CONSUMER_ID,
      mode: { type: 'batch', size: 100 },
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        consumerConfig: {
          'metadata.broker.list': config.get('KAFKA_BROKER'),
          'group.id': 'idp-consumer',
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

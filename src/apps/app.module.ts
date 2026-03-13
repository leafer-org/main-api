import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';

import { CmsModule } from '../features/cms/cms.module.js';
import { DISCOVERY_CONSUMER_ID } from '../features/discovery/adapters/kafka/consumer-ids.js';
import { DiscoveryModule } from '../features/discovery/discovery.module.js';
import { IDP_CONSUMER_ID } from '../features/idp/adapters/kafka/consumer-ids.js';
import { IdpModule } from '../features/idp/idp.module.js';
import { MediaModule } from '../features/media/media.module.js';
import { ORGANIZATION_CONSUMER_ID } from '../features/organization/adapters/kafka/consumer-ids.js';
import { OrganizationModule } from '../features/organization/organization.module.js';
import { INTERACTIONS_CONSUMER_ID } from '../features/interactions/adapters/kafka/consumer-ids.js';
import { InteractionsModule } from '../features/interactions/interactions.module.js';
import { ReviewsModule } from '../features/reviews/reviews.module.js';
import { TicketsModule } from '../features/tickets/tickets.module.js';
import { MainDbModule } from './db.module.js';
import { MainGorseModule } from './gorse.module.js';
import { MainRedisModule } from './redis.module.js';
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
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    ScheduleModule.forRoot(),
    MainDbModule,
    MainGorseModule,
    MainRedisModule,
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
    KafkaConsumerModule.registerAsync({
      consumerId: DISCOVERY_CONSUMER_ID,
      mode: { type: 'single' },
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        consumerConfig: {
          'metadata.broker.list': config.get('KAFKA_BROKER'),
          'group.id': 'discovery-consumer',
        },
      }),
      inject: [MainConfigService],
    }),
    KafkaConsumerModule.registerAsync({
      consumerId: ORGANIZATION_CONSUMER_ID,
      mode: { type: 'single' },
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        consumerConfig: {
          'metadata.broker.list': config.get('KAFKA_BROKER'),
          'group.id': 'organization-consumer',
        },
      }),
      inject: [MainConfigService],
    }),
    KafkaConsumerModule.registerAsync({
      consumerId: INTERACTIONS_CONSUMER_ID,
      mode: { type: 'single' },
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        consumerConfig: {
          'metadata.broker.list': config.get('KAFKA_BROKER'),
          'group.id': 'interactions-consumer',
        },
      }),
      inject: [MainConfigService],
    }),
    OutboxRelayModule,
    IdpModule,
    MediaModule,
    DiscoveryModule,
    CmsModule,
    OrganizationModule,
    ReviewsModule,
    InteractionsModule,
    TicketsModule,
  ],
})
export class AppModule {}

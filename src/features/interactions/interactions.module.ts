import { Module } from '@nestjs/common';

import {
  DrizzleInteractionDedupRepository,
  DrizzleInteractionWriteRepository,
} from './adapters/db/interaction-write.repository.js';
import { InteractionsController } from './adapters/http/interactions.controller.js';
import { KafkaInteractionPublisher } from './adapters/kafka/interaction-publisher.adapter.js';
import { LikeConsumerKafkaHandler } from './adapters/kafka/like-consumer.handler.js';
import { ReviewConsumerKafkaHandler } from './adapters/kafka/review-consumer.handler.js';
import {
  InteractionDedupPort,
  InteractionPublisherPort,
  InteractionWritePort,
} from './application/ports.js';
import { ConsumeLikeHandler } from './application/use-cases/consume-like/consume-like.handler.js';
import { ConsumeReviewHandler } from './application/use-cases/consume-review/consume-review.handler.js';
import { RecordInteractionInteractor } from './application/use-cases/record-interaction/record-interaction.interactor.js';
import { RecordViewsInteractor } from './application/use-cases/record-views/record-views.interactor.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Module({
  controllers: [InteractionsController],
  providers: [
    // Infrastructure
    { provide: Clock, useClass: SystemClock },

    // Port → Adapter
    { provide: InteractionWritePort, useClass: DrizzleInteractionWriteRepository },
    { provide: InteractionDedupPort, useClass: DrizzleInteractionDedupRepository },
    { provide: InteractionPublisherPort, useClass: KafkaInteractionPublisher },

    // Use cases
    RecordViewsInteractor,
    RecordInteractionInteractor,

    // Kafka consumer handlers
    ConsumeLikeHandler,
    ConsumeReviewHandler,
    LikeConsumerKafkaHandler,
    ReviewConsumerKafkaHandler,
  ],
})
export class InteractionsModule {}

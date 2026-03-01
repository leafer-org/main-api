import type { INestApplication } from '@nestjs/common';

import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';
import { OutboxRelayService } from '@/infra/lib/nest-outbox/outbox-relay.service.js';

export async function flushOutbox(app: INestApplication): Promise<void> {
  const relay = app.get(OutboxRelayService);
  await relay.flush();

  const producer = app.get(KafkaProducerService);
  await producer.flush();
}

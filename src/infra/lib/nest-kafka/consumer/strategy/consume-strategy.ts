import type Kafka from 'node-rdkafka';

import type { KafkaConsumerConnection } from '../loop/kafka-consumer-connection.js';

export interface ConsumeStrategy {
  readonly batchSize: number;
  readonly topics: string[];
  handleMessages(rawMessages: Kafka.Message[]): Promise<void>;
  commitSuccess(connection: KafkaConsumerConnection, rawMessages: Kafka.Message[]): void;
  seekOnRetry(connection: KafkaConsumerConnection, rawMessages: Kafka.Message[]): void;
}

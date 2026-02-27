import type Kafka from 'node-rdkafka';

import type { KafkaErrorHandlingStrategy } from './kafka-error-handling-strategy.js';

export type BatchConsumerMode = {
  type: 'batch';
  size: number;
};
export type SingleConsumerMode = { type: 'single' };
export type ConsumerMode = BatchConsumerMode | SingleConsumerMode;

export type RetryOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
};

export type KafkaConsumerModuleOptions = {
  consumerConfig: Omit<
    Kafka.ConsumerGlobalConfig,
    'enable.auto.commit' | 'auto.commit.interval.ms' | 'rebalance_cb'
  >;
  consumerTopicConfig?: Kafka.ConsumerTopicConfig;
  errorHandlingStrategy?: KafkaErrorHandlingStrategy;
  maxConsecutiveErrors?: number;
  concurrency?: number;
  connectTimeout?: number;
  retry?: RetryOptions;
};

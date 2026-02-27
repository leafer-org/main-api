import type Kafka from 'node-rdkafka';

export type KafkaProducerModuleOptions = {
  producerConfig: Kafka.ProducerGlobalConfig;
  producerTopicConfig?: Kafka.ProducerTopicConfig;
  pollInterval?: number;
  connectTimeout?: number;
  onDeliveryError?: (error: Error, report: Kafka.DeliveryReport) => void;
};

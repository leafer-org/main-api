import type Kafka from '@confluentinc/kafka-javascript';

export type KafkaProducerModuleOptions = {
  producerConfig: Kafka.ProducerGlobalConfig;
  producerTopicConfig?: Kafka.ProducerTopicConfig;
  pollInterval?: number;
  connectTimeout?: number;
  onDeliveryError?: (error: Error, report: Kafka.DeliveryReport) => void;
};

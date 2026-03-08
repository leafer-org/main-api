import Kafka from '@confluentinc/kafka-javascript';

export function toError(kafkaError: Kafka.LibrdKafkaError): Error {
  const error = new Error(kafkaError.message);
  error.name = kafkaError.code?.toString() ?? 'KafkaError';
  error.cause = kafkaError;
  return error;
}

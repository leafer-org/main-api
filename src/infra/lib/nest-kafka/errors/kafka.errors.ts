export class KafkaError extends Error {
  public constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'KafkaError';
    this.cause = cause;
  }
}

export class KafkaConnectionError extends KafkaError {
  public constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'KafkaConnectionError';
  }
}

export class KafkaProducerError extends KafkaError {
  public constructor(
    message: string,
    public readonly topic: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'KafkaProducerError';
  }
}

export class KafkaConsumerError extends KafkaError {
  public constructor(
    message: string,
    public readonly topic: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'KafkaConsumerError';
  }
}

export class KafkaSerializationError extends KafkaError {
  public constructor(
    message: string,
    public readonly topic: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'KafkaSerializationError';
  }
}

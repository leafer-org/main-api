export type KafkaErrorAction = 'skip' | 'retry';

export type KafkaExceptionContext = {
  topic: string;
  partition: number;
  offset: number;
};

export interface KafkaErrorHandlingStrategy {
  handle(
    error: Error,
    context: KafkaExceptionContext,
  ): Promise<KafkaErrorAction> | KafkaErrorAction;
}

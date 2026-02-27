import { Logger } from '@nestjs/common';
import type Kafka from 'node-rdkafka';
import pLimit from 'p-limit';

import type { Contract } from '../../contract/contract.js';
import { KafkaSerializationError } from '../../errors/kafka.errors.js';
import type { MessageInvoker } from '../handler/handler-invoker.js';
import type { KafkaMessage } from '../handler/kafka-handler.interface.js';
import type { KafkaConsumerConnection } from '../loop/kafka-consumer-connection.js';
import type { ConsumeStrategy } from './consume-strategy.js';
import { parseHeaders } from './parse-headers.js';

type RegisteredHandler = {
  contract: Contract;
  invoke: MessageInvoker;
};

export class SingleConsumeStrategy implements ConsumeStrategy {
  private readonly logger = new Logger(SingleConsumeStrategy.name);
  private readonly handlersByTopic = new Map<string, RegisteredHandler[]>();
  private readonly limit: ReturnType<typeof pLimit>;

  public readonly batchSize = 1;

  public constructor(concurrency: number) {
    this.limit = pLimit(concurrency);
  }

  public get topics(): string[] {
    return Array.from(this.handlersByTopic.keys());
  }

  public register(contracts: Contract[], invoke: MessageInvoker): void {
    for (const contract of contracts) {
      const existing = this.handlersByTopic.get(contract.topic) ?? [];
      existing.push({ contract, invoke });
      this.handlersByTopic.set(contract.topic, existing);
    }
  }

  public async handleMessages(rawMessages: Kafka.Message[]): Promise<void> {
    // biome-ignore lint/style/noNonNullAssertion: batchSize=1, length checked by caller
    const rawMessage = rawMessages[0]!;
    const { topic } = rawMessage;
    const handlers = this.handlersByTopic.get(topic);

    if (!handlers || handlers.length === 0) {
      this.logger.warn(`No handler registered for topic: ${topic}`);
      return;
    }

    // biome-ignore lint/style/noNonNullAssertion: проверка выше
    const kafkaMessage = this.buildKafkaMessage(rawMessage, handlers[0]!.contract);

    await Promise.all(
      handlers.map((registered) => this.limit(() => registered.invoke(kafkaMessage))),
    );
  }

  public commitSuccess(connection: KafkaConsumerConnection, rawMessages: Kafka.Message[]): void {
    // biome-ignore lint/style/noNonNullAssertion: batchSize=1, length checked by caller
    connection.commitMessage(rawMessages[0]!);
  }

  public seekOnRetry(connection: KafkaConsumerConnection, rawMessages: Kafka.Message[]): void {
    // biome-ignore lint/style/noNonNullAssertion: batchSize=1, length checked by caller
    const msg = rawMessages[0]!;
    connection.seek(msg.topic, msg.partition, msg.offset);
  }

  private buildKafkaMessage(
    rawMessage: Kafka.Message,
    contract: Contract,
  ): KafkaMessage<string, unknown> {
    let value: unknown;
    try {
      value = contract.serializer.deserialize(rawMessage.value as Buffer);
    } catch (error) {
      throw new KafkaSerializationError(
        'Failed to deserialize message',
        rawMessage.topic,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return {
      value,
      topic: rawMessage.topic,
      partition: rawMessage.partition,
      offset: rawMessage.offset,
      key: rawMessage.key?.toString(),
      timestamp: rawMessage.timestamp ?? Date.now(),
      headers: parseHeaders(rawMessage.headers),
    };
  }
}

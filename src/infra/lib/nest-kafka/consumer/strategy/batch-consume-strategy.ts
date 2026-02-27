import { Logger } from '@nestjs/common';
import type Kafka from 'node-rdkafka';
import pLimit from 'p-limit';

import type { Contract } from '../../contract/contract.js';
import { KafkaSerializationError } from '../../errors/kafka.errors.js';
import type { BatchInvoker } from '../handler/handler-invoker.js';
import type { BatchOptions, KafkaMessage } from '../handler/kafka-handler.interface.js';
import type { KafkaConsumerConnection } from '../loop/kafka-consumer-connection.js';
import type { ConsumeStrategy } from './consume-strategy.js';
import { parseHeaders } from './parse-headers.js';

type RegisteredBatchHandler = {
  contracts: Contract[];
  invoke: BatchInvoker;
};

export class BatchConsumeStrategy implements ConsumeStrategy {
  private readonly logger = new Logger(BatchConsumeStrategy.name);
  private readonly contractsByTopic = new Map<string, Contract>();
  private readonly handlers: RegisteredBatchHandler[] = [];
  private readonly limit: ReturnType<typeof pLimit>;

  public readonly batchSize: number;

  public constructor(batchOptions: BatchOptions, concurrency: number) {
    this.batchSize = batchOptions.size;
    this.limit = pLimit(concurrency);
  }

  public get topics(): string[] {
    return Array.from(this.contractsByTopic.keys());
  }

  public register(contracts: Contract[], invoke: BatchInvoker): void {
    this.handlers.push({ contracts, invoke });
    for (const contract of contracts) {
      this.contractsByTopic.set(contract.topic, contract);
    }
  }

  public async handleMessages(rawMessages: Kafka.Message[]): Promise<void> {
    const messages = this.deserializeBatch(rawMessages);

    const messagesByTopic = new Map<string, KafkaMessage<string, unknown>[]>();
    for (const message of messages) {
      let topicMessages = messagesByTopic.get(message.topic);
      if (!topicMessages) {
        topicMessages = [];
        messagesByTopic.set(message.topic, topicMessages);
      }
      topicMessages.push(message);
    }

    await Promise.all(
      this.handlers.map((handler) => {
        const handlerMessages = handler.contracts.flatMap(
          (c) => messagesByTopic.get(c.topic) ?? [],
        );

        if (handlerMessages.length === 0) {
          return Promise.resolve();
        }

        return this.limit(() => handler.invoke(handlerMessages));
      }),
    );
  }

  public commitSuccess(connection: KafkaConsumerConnection): void {
    connection.commit();
  }

  public seekOnRetry(connection: KafkaConsumerConnection, rawMessages: Kafka.Message[]): void {
    const earliestByPartition = new Map<string, Kafka.Message>();

    for (const msg of rawMessages) {
      const key = `${msg.topic}-${msg.partition}`;
      const existing = earliestByPartition.get(key);
      if (!existing || msg.offset < existing.offset) {
        earliestByPartition.set(key, msg);
      }
    }

    for (const msg of earliestByPartition.values()) {
      connection.seek(msg.topic, msg.partition, msg.offset);
    }
  }

  private deserializeBatch(rawMessages: Kafka.Message[]): KafkaMessage<string, unknown>[] {
    const messages: KafkaMessage<string, unknown>[] = [];

    for (const rawMessage of rawMessages) {
      const { topic } = rawMessage;
      const contract = this.contractsByTopic.get(topic);

      if (!contract) {
        this.logger.warn(`No contract registered for topic: ${topic}`);
        continue;
      }

      let value: unknown;
      try {
        value = contract.serializer.deserialize(rawMessage.value as Buffer);
      } catch (error) {
        throw new KafkaSerializationError(
          'Failed to deserialize message',
          topic,
          error instanceof Error ? error : new Error(String(error)),
        );
      }

      messages.push({
        value,
        topic: rawMessage.topic,
        partition: rawMessage.partition,
        offset: rawMessage.offset,
        key: rawMessage.key?.toString(),
        timestamp: rawMessage.timestamp ?? Date.now(),
        headers: parseHeaders(rawMessage.headers),
      });
    }

    return messages;
  }
}

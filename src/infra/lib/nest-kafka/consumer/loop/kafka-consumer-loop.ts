import { Logger } from '@nestjs/common';
import type Kafka from 'node-rdkafka';

import { KafkaConnectionError } from '../../errors/kafka.errors.js';
import type { KafkaErrorHandlingStrategy } from '../kafka-error-handling-strategy.js';
import type { ConsumeStrategy } from '../strategy/consume-strategy.js';
import type { KafkaConsumerConnection } from './kafka-consumer-connection.js';
import type { RetryTrackerOptions } from './retry-tracker.js';
import { RetryTracker } from './retry-tracker.js';

export class KafkaConsumerLoop {
  private readonly logger = new Logger(KafkaConsumerLoop.name);
  private readonly retryTracker: RetryTracker;
  private isConsuming = false;
  private stoppedPromise: Promise<void> = Promise.resolve();

  public constructor(
    private readonly strategy: ConsumeStrategy,
    private readonly errorHandlingStrategy?: KafkaErrorHandlingStrategy,
    maxConsecutiveErrors = 5,
    retryOptions?: RetryTrackerOptions,
  ) {
    this.retryTracker = new RetryTracker(maxConsecutiveErrors, retryOptions);
  }

  public get topics(): string[] {
    return this.strategy.topics;
  }

  public startConsuming(connection: KafkaConsumerConnection): Promise<void> {
    this.isConsuming = true;
    this.stoppedPromise = this.consumeLoop(connection);
    return this.stoppedPromise;
  }

  public async stop(): Promise<void> {
    this.isConsuming = false;
    try {
      await this.stoppedPromise;
    } catch {
      // Errors are handled by the consumer service via handleFatalError
    }
  }

  private async consumeLoop(connection: KafkaConsumerConnection): Promise<void> {
    while (this.isConsuming) {
      let rawMessages: Kafka.Message[];

      try {
        // biome-ignore lint/performance/noAwaitInLoops: последовательная обработка сообщений для гарантии порядка коммитов
        rawMessages = await connection.consumeBatch(this.strategy.batchSize);
      } catch (error) {
        this.retryTracker.incrementTry();
        this.logger.error(
          `Failed to consume (${this.retryTracker.tryCount}/${this.retryTracker.isExhausted ? 'exhausted' : 'retrying'})`,
          error,
        );

        if (this.retryTracker.isExhausted) {
          throw new KafkaConnectionError(
            `Consumer crashed after ${this.retryTracker.tryCount} consecutive errors`,
            error instanceof Error ? error : new Error(String(error)),
          );
        }

        await this.retryTracker.delay();
        continue;
      }

      if (rawMessages.length === 0) {
        continue;
      }

      try {
        await this.strategy.handleMessages(rawMessages);
        this.strategy.commitSuccess(connection, rawMessages);
        this.retryTracker.reset();
      } catch (error) {
        const action = await this.handleError(
          error instanceof Error ? error : new Error(String(error)),
          rawMessages,
        );

        if (action === 'skip') {
          this.strategy.commitSuccess(connection, rawMessages);
          this.retryTracker.reset();
        } else {
          this.retryTracker.incrementTry();

          if (this.retryTracker.isExhausted) {
            throw new KafkaConnectionError(
              `Consumer crashed after ${this.retryTracker.tryCount} consecutive errors`,
              error instanceof Error ? error : new Error(String(error)),
            );
          }

          this.strategy.seekOnRetry(connection, rawMessages);
          await this.retryTracker.delay();
        }
      }
    }
  }

  private async handleError(error: Error, rawMessages: Kafka.Message[]): Promise<'skip' | 'retry'> {
    const firstMessage = rawMessages[0];

    if (!this.errorHandlingStrategy) {
      this.logger.error(
        `Error processing message from ${firstMessage?.topic}[${firstMessage?.partition}]@${firstMessage?.offset}`,
        error,
      );
      return 'retry';
    }

    try {
      return await this.errorHandlingStrategy.handle(error, {
        topic: firstMessage?.topic ?? 'unknown',
        partition: firstMessage?.partition ?? -1,
        offset: firstMessage?.offset ?? -1,
      });
    } catch (filterError) {
      this.logger.error('Error handling strategy threw an error', filterError);
      return 'retry';
    }
  }
}

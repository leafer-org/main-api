import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import type { ConsumerId } from './consumer-id.js';
import type { DiscoveredHandler } from './handler/handler-discovery.js';
import { HandlerDiscovery } from './handler/handler-discovery.js';
import { HandlerInvoker } from './handler/handler-invoker.js';
import { MODULE_OPTIONS_TOKEN } from './kafka-consumer.module-definitions.js';
import type {
  BatchConsumerMode,
  ConsumerMode,
  KafkaConsumerModuleOptions,
} from './kafka-consumer.options.js';
import { KafkaConsumerConnection } from './loop/kafka-consumer-connection.js';
import { KafkaConsumerLoop } from './loop/kafka-consumer-loop.js';
import { BatchConsumeStrategy } from './strategy/batch-consume-strategy.js';
import { SingleConsumeStrategy } from './strategy/single-consume-strategy.js';
import { CONSUMER_ID_TOKEN, CONSUMER_MODE_TOKEN } from './tokens.js';

const DEFAULT_MAX_CONSECUTIVE_ERRORS = 5;
const DEFAULT_CONCURRENCY = 40;

type ConsumerState =
  | { type: 'idle' }
  | {
      type: 'running';
      consumer: KafkaConsumerLoop;
      connection: KafkaConsumerConnection;
    };

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private state: ConsumerState = { type: 'idle' };
  public isHealthy = false;

  public constructor(
    @Inject(forwardRef(() => MODULE_OPTIONS_TOKEN))
    private readonly options: KafkaConsumerModuleOptions,
    @Inject(forwardRef(() => CONSUMER_ID_TOKEN))
    private readonly consumerId: ConsumerId,
    @Inject(forwardRef(() => CONSUMER_MODE_TOKEN))
    private readonly mode: ConsumerMode,
    @Inject(HandlerDiscovery)
    private readonly handlerDiscovery: HandlerDiscovery,
    @Inject(ModuleRef)
    private readonly moduleRef: ModuleRef,
  ) {}

  public async onModuleInit(): Promise<void> {
    const discovered = this.handlerDiscovery.getHandlers(this.consumerId);

    if (discovered.length === 0) {
      this.logger.warn('No handlers discovered for consumer');
      return;
    }

    const maxConsecutiveErrors =
      this.options.maxConsecutiveErrors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;
    const concurrency = this.options.concurrency ?? DEFAULT_CONCURRENCY;
    const invoker = new HandlerInvoker(this.moduleRef);

    const consumer = this.createConsumer(discovered, concurrency, invoker, maxConsecutiveErrors);

    const topics = consumer.topics;
    if (topics.length === 0) {
      this.logger.warn('No topics registered for consumer');
      return;
    }

    const connection = new KafkaConsumerConnection(this.options, topics);
    this.state = { type: 'running', consumer, connection };
    this.logger.log(`Consumer ${this.consumerId.description} connecting...`);
    await connection.connect();
    this.isHealthy = true;
    this.handleFatalError(consumer.startConsuming(connection));
  }

  private createConsumer(
    discovered: DiscoveredHandler[],
    concurrency: number,
    invoker: HandlerInvoker,
    maxConsecutiveErrors: number,
  ): KafkaConsumerLoop {
    if (this.mode.type === 'single') {
      return this.createSingleConsumer(discovered, concurrency, invoker, maxConsecutiveErrors);
    }
    return this.createBatchConsumer(
      discovered,
      this.mode,
      concurrency,
      invoker,
      maxConsecutiveErrors,
    );
  }

  private createSingleConsumer(
    discovered: DiscoveredHandler[],
    concurrency: number,
    invoker: HandlerInvoker,
    maxConsecutiveErrors: number,
  ): KafkaConsumerLoop {
    const batchHandlers = discovered.filter((h) => h.batch);
    if (batchHandlers.length > 0) {
      throw new Error(
        `Consumer mode is 'single' but batch handlers were discovered: ${batchHandlers.map((h) => h.methodKey).join(', ')}. ` +
          "Use mode: { type: 'batch', size: ... } to enable batch processing.",
      );
    }

    const strategy = new SingleConsumeStrategy(concurrency);

    for (const handler of discovered) {
      strategy.register(
        handler.contracts,
        invoker.createMessageInvoker(
          handler.instance,
          handler.methodKey,
          handler.isRequestScoped,
          handler.metatype,
        ),
      );
    }

    return new KafkaConsumerLoop(
      strategy,
      this.options.errorHandlingStrategy,
      maxConsecutiveErrors,
      this.options.retry,
    );
  }

  private createBatchConsumer(
    discovered: DiscoveredHandler[],
    mode: BatchConsumerMode,
    concurrency: number,
    invoker: HandlerInvoker,
    maxConsecutiveErrors: number,
  ): KafkaConsumerLoop {
    const singleHandlers = discovered.filter((h) => !h.batch);
    if (singleHandlers.length > 0) {
      throw new Error(
        `Consumer mode is 'batch' but single handlers were discovered: ${singleHandlers.map((h) => h.methodKey).join(', ')}. ` +
          "Use mode: { type: 'single' } or remove @BatchContractHandler decorators.",
      );
    }

    const strategy = new BatchConsumeStrategy(mode, concurrency);

    for (const handler of discovered) {
      strategy.register(
        handler.contracts,
        invoker.createBatchInvoker(
          handler.instance,
          handler.methodKey,
          handler.isRequestScoped,
          handler.metatype,
        ),
      );
    }

    return new KafkaConsumerLoop(
      strategy,
      this.options.errorHandlingStrategy,
      maxConsecutiveErrors,
      this.options.retry,
    );
  }

  public async onModuleDestroy(): Promise<void> {
    this.isHealthy = false;
    if (this.state.type === 'running') {
      await this.state.consumer.stop();
      await this.state.connection.disconnect();
    }
  }

  private handleFatalError(consumePromise: Promise<void>): void {
    consumePromise.catch(async (error) => {
      this.isHealthy = false;
      this.logger.fatal('Consumer crashed due to consecutive errors', error);

      try {
        if (this.state.type === 'running') {
          await this.state.connection.disconnect();
        }
      } catch (disconnectError) {
        this.logger.error('Failed to disconnect during shutdown', disconnectError);
      }
    });
  }
}

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import Kafka from 'node-rdkafka';

const { Producer } = Kafka;

const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_FLUSH_TIMEOUT_MS = 10000;
const DEFAULT_CONNECT_TIMEOUT_MS = 30000;

import type { Contract, ContractMessage } from '../contract/contract.js';
import { KafkaConnectionError, KafkaProducerError } from '../errors/kafka.errors.js';
import { toError } from '../errors/to-error.js';
import { MODULE_OPTIONS_TOKEN } from './kafka-producer.module-definitions.js';
import type { KafkaProducerModuleOptions } from './kafka-producer.options.js';

export type SendOptions = {
  key?: string;
  partition?: number;
  headers?: Record<string, string>;
};

export type BatchMessage<C extends Contract> = {
  value: ContractMessage<C>;
  key?: string;
  partition?: number;
  headers?: Record<string, string>;
};

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly producer: Kafka.Producer;
  private isConnected = false;

  public constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private readonly options: KafkaProducerModuleOptions,
  ) {
    this.producer = new Producer(
      this.options.producerConfig,
      this.options.producerTopicConfig ?? {},
    );

    this.producer.on('event.error', (kafkaError: Kafka.LibrdKafkaError) => {
      this.logger.error('Kafka producer error', kafkaError);
    });

    this.producer.on('disconnected', () => {
      this.isConnected = false;
      this.logger.warn('Kafka producer disconnected');
    });

    this.producer.on('delivery-report', (error, report) => {
      if (error) {
        this.logger.error('Delivery failed', { error, report });
        this.options.onDeliveryError?.(toError(error), report);
      }
    });
  }

  public get isHealthy(): boolean {
    return this.isConnected;
  }

  public async onModuleInit(): Promise<void> {
    await this.connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.flush();
    await this.disconnect();
  }

  public send<C extends Contract>(
    contract: C,
    message: ContractMessage<C>,
    options?: SendOptions,
  ): void {
    if (!this.isConnected) {
      throw new KafkaConnectionError('Producer is not connected');
    }

    const serializer = contract.serializer;
    const buffer = serializer.serialize(message);

    const headers = options?.headers
      ? Object.entries(options.headers).map(([key, value]) => ({
          [key]: Buffer.from(value),
        }))
      : undefined;

    this.producer.produce(
      contract.topic,
      options?.partition ?? null,
      buffer,
      options?.key ?? null,
      Date.now(),
      undefined,
      headers,
    );
  }

  public sendBatch<C extends Contract>(contract: C, messages: BatchMessage<C>[]): void {
    if (!this.isConnected) {
      throw new KafkaConnectionError('Producer is not connected');
    }

    const serializer = contract.serializer;

    for (const msg of messages) {
      const buffer = serializer.serialize(msg.value);

      const headers = msg.headers
        ? Object.entries(msg.headers).map(([key, value]) => ({
            [key]: Buffer.from(value),
          }))
        : undefined;

      this.producer.produce(
        contract.topic,
        msg.partition ?? null,
        buffer,
        msg.key ?? null,
        Date.now(),
        undefined,
        headers,
      );
    }
  }

  public async flush(timeout = DEFAULT_FLUSH_TIMEOUT_MS): Promise<void> {
    return new Promise((resolve, reject) => {
      this.producer.flush(timeout, (error: Kafka.LibrdKafkaError | undefined) => {
        if (error) {
          reject(new KafkaProducerError('Failed to flush producer', 'flush', toError(error)));
        } else {
          resolve();
        }
      });
    });
  }

  private async connect(): Promise<void> {
    const timeout = this.options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.logger.log('Kafka producer connecting...');

    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new KafkaConnectionError(`Producer connect timed out after ${timeout}ms`));
        }
      }, timeout);

      const onReady = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        cleanup();
        this.isConnected = true;
        this.producer.setPollInterval(this.options.pollInterval ?? DEFAULT_POLL_INTERVAL_MS);
        this.logger.log('Kafka producer connected');
        resolve();
      };

      const onError = (kafkaError: Kafka.LibrdKafkaError) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(new KafkaConnectionError('Failed to connect producer', toError(kafkaError)));
      };

      const cleanup = () => {
        this.producer.removeListener('ready', onReady);
        this.producer.removeListener('event.error', onError);
      };

      this.producer.once('ready', onReady);
      this.producer.once('event.error', onError);
      this.producer.connect();
    });
  }

  private async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.producer.disconnect(() => {
        this.isConnected = false;
        this.logger.log('Kafka producer disconnected');
        resolve();
      });
    });
  }
}

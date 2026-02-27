import { Logger } from '@nestjs/common';
import Kafka from 'node-rdkafka';

import { KafkaConnectionError } from '../../errors/kafka.errors.js';
import { toError } from '../../errors/to-error.js';
import type { KafkaConsumerModuleOptions } from '../kafka-consumer.options.js';

const { KafkaConsumer: RdKafkaConsumer } = Kafka;

function formatAssignments(assignments: Kafka.Assignment[]): string {
  return assignments.map((a) => `${a.topic}[${a.partition}]`).join(', ');
}

const SECOND = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 30000;

export class KafkaConsumerConnection {
  private readonly logger = new Logger(KafkaConsumerConnection.name);
  private consumer: Kafka.KafkaConsumer | undefined;

  public constructor(
    private readonly options: KafkaConsumerModuleOptions,
    private readonly topics: string[],
  ) {}

  public async connect(): Promise<void> {
    const timeout = this.options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let settled = false;

      this.consumer = new RdKafkaConsumer(
        {
          ...this.options.consumerConfig,
          'enable.auto.commit': false,
          rebalance_cb: true,
        },
        this.options.consumerTopicConfig ?? {},
      );

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new KafkaConnectionError(`Consumer connect timed out after ${timeout}ms`));
        }
      }, timeout);

      const onReady = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        cleanup();
        this.logger.log('Kafka consumer connected');

        this.consumer?.subscribe(this.topics);
        this.logger.log(`Subscribed to topics: ${this.topics.join(', ')}`);

        resolve();
      };

      const onError = (kafkaError: Kafka.LibrdKafkaError) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          reject(new KafkaConnectionError('Failed to connect consumer', toError(kafkaError)));
        }
      };

      const cleanup = () => {
        this.consumer?.removeListener('ready', onReady);
        this.consumer?.removeListener('event.error', onError);
      };

      this.consumer.on(
        'rebalance',
        (err: Kafka.LibrdKafkaError, assignments: Kafka.Assignment[]) => {
          if (err.code === Kafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS) {
            this.logger.log(`Partitions assigned: ${formatAssignments(assignments)}`);
            this.consumer?.assign(assignments);
          } else if (err.code === Kafka.CODES.ERRORS.ERR__REVOKE_PARTITIONS) {
            this.logger.log(`Partitions revoked: ${formatAssignments(assignments)}`);
            this.consumer?.unassign();
          } else {
            this.logger.error(`Rebalance error: ${err.message}`);
          }
        },
      );

      this.consumer.on('event.error', (kafkaError: Kafka.LibrdKafkaError) => {
        this.logger.error('Kafka consumer error', kafkaError);
      });

      this.consumer.on('disconnected', () => {
        this.logger.warn('Kafka consumer disconnected');
      });

      this.consumer.once('ready', onReady);
      this.consumer.once('event.error', onError);
      this.consumer.connect();
    });
  }

  public async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.consumer) {
        resolve();
        return;
      }

      this.consumer.disconnect(() => {
        this.logger.log('Kafka consumer disconnected');
        resolve();
      });
    });
  }

  public commitMessage(message: Kafka.Message): void {
    this.consumer?.commitMessage(message);
  }

  public commit(): void {
    this.consumer?.commit();
  }

  public seek(topic: string, partition: number, offset: number): void {
    if (!this.consumer) {
      return;
    }

    this.consumer.seek({ topic, partition, offset }, SECOND, (err) => {
      if (err) {
        this.logger.error(`Failed to seek to ${topic}[${partition}]@${offset}`, err);
      }
    });
  }

  public async consumeBatch(size: number): Promise<Kafka.Message[]> {
    return new Promise((resolve, reject) => {
      if (!this.consumer) {
        resolve([]);
        return;
      }

      this.consumer.consume(size, (error, messages) => {
        if (error) {
          reject(new KafkaConnectionError('Failed to consume batch', toError(error)));
          return;
        }
        resolve(messages);
      });
    });
  }
}

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { StartedRedpandaContainer } from '@testcontainers/redpanda';
import { parse } from 'yaml';

import { KafkaConsumerService } from '@/infra/lib/nest-kafka/consumer/kafka-consumer.service.js';

const TOPICS_DIR = resolve(import.meta.dirname, '..', '..', '..', '..', 'topicctl', 'topics');

export async function applyTopics(container: StartedRedpandaContainer): Promise<void> {
  const files = readdirSync(TOPICS_DIR).filter((f) => f.endsWith('.yaml'));

  const topics = files.map((f) => {
    const doc = parse(readFileSync(join(TOPICS_DIR, f), 'utf-8')) as {
      meta: { name: string };
      spec: { partitions?: number };
    };
    return { name: doc.meta.name, partitions: doc.spec.partitions ?? 1 };
  });

  await Promise.all(
    topics.map((t) =>
      container.exec(['rpk', 'topic', 'create', t.name, '-p', String(t.partitions)]),
    ),
  );
}

/**
 * Ожидает готовности всех Kafka consumer'ов во всех модулях приложения.
 * Обходит внутренний DI-контейнер NestJS и вызывает `waitForPartitions()`
 * у каждого найденного `KafkaConsumerService`.
 *
 * Используется вместо `app.get(KafkaConsumerService).waitForPartitions()`,
 * когда в приложении несколько модулей с собственными consumer'ами.
 */
export async function waitForAllConsumers(app: INestApplication): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: accessing internal NestJS container
  const container = (app as any).container;
  const modules = container.getModules() as Map<string, any>;
  const promises: Promise<void>[] = [];
  for (const [key, mod] of modules) {
    const wrapper = mod.providers?.get(KafkaConsumerService);
    if (wrapper?.instance && typeof wrapper.instance.waitForPartitions === 'function') {
      console.log(`[waitForAllConsumers] found consumer in module: ${key}`);
      promises.push(wrapper.instance.waitForPartitions());
    }
  }
  console.log(`[waitForAllConsumers] waiting for ${promises.length} consumers`);
  await Promise.all(promises);
  console.log('[waitForAllConsumers] all consumers ready');
}

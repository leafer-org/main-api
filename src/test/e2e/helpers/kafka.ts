import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StartedRedpandaContainer } from '@testcontainers/redpanda';
import { parse } from 'yaml';

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

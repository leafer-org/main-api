import type { Client, estypes } from '@elastic/elasticsearch';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import type { IndexDefinition } from './index-definition.js';
import { SearchConnectionPool } from './search-connection-pool.js';

const logger = new Logger('SearchClient');

function isAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof Error) || !('meta' in error)) return false;

  const meta = (error as Record<string, unknown>).meta as Record<string, unknown> | undefined;
  const body = meta?.body as Record<string, unknown> | undefined;
  const errorDetail = body?.error as Record<string, unknown> | undefined;

  return errorDetail?.type === 'resource_already_exists_exception';
}

async function ensureIndex(client: Client, def: IndexDefinition) {
  try {
    const exists = await client.indices.exists({ index: def.name });

    if (exists) {
      logger.debug(`Search index "${def.name}" already exists`);
      return;
    }

    await client.indices.create({
      index: def.name,
      settings: def.settings,
      mappings: def.mappings,
    });
    logger.log(`Created search index "${def.name}"`);
  } catch (error: unknown) {
    if (isAlreadyExistsError(error)) {
      logger.debug(`Search index "${def.name}" already exists (concurrent creation)`);
      return;
    }

    logger.error(`Failed to ensure search index "${def.name}"`, error);
    throw error;
  }
}

export function CreateSearchClient(indices: IndexDefinition[]) {
  @Injectable()
  class SearchClient implements OnModuleInit {
    public readonly client: Client;
    public readonly indices: IndexDefinition[];

    public constructor(connectionPool: SearchConnectionPool) {
      this.client = connectionPool.client;
      this.indices = indices;
    }

    public async onModuleInit() {
      await Promise.all(this.indices.map((def) => ensureIndex(this.client, def)));
    }

    public async index<T extends Record<string, unknown>>(
      indexName: string,
      id: string,
      document: T,
    ) {
      return this.client.index({ index: indexName, id, document, refresh: true });
    }

    public async bulkIndex<T extends Record<string, unknown>>(
      indexName: string,
      docs: Array<{ id: string; document: T }>,
    ) {
      const operations = docs.flatMap(({ id, document }) => [
        { index: { _index: indexName, _id: id } },
        document,
      ]);

      return this.client.bulk({ operations, refresh: true });
    }

    public async deleteDoc(indexName: string, id: string) {
      return this.client.delete({ index: indexName, id, refresh: true });
    }

    public async search<T>(
      indexName: string,
      query: Record<string, unknown>,
    ): Promise<estypes.SearchResponse<T>> {
      return this.client.search<T>({ index: indexName, ...query });
    }
  }

  return SearchClient;
}

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Meilisearch, SearchResponse, Task } from 'meilisearch';

import type { IndexDefinition } from './index-definition.js';
import { SearchConnectionPool } from './search-connection-pool.js';

const logger = new Logger('SearchClient');

function assertTaskSucceeded(task: Task): void {
  if (task.status === 'failed') {
    const detail = task.error?.message ?? 'unknown error';
    throw new Error(`MeiliSearch task ${task.uid} failed: ${detail}`);
  }
}

async function ensureIndex(meili: Meilisearch, def: IndexDefinition) {
  try {
    await meili.getIndex(def.name);
    logger.debug(`Search index "${def.name}" already exists`);
  } catch {
    const task = await meili.createIndex(def.name, { primaryKey: def.primaryKey });
    await meili.tasks.waitForTask(task.taskUid);
    logger.log(`Created search index "${def.name}"`);
  }

  const idx = meili.index(def.name);

  const settings: Record<string, unknown> = {};
  if (def.searchableAttributes) settings.searchableAttributes = def.searchableAttributes;
  if (def.filterableAttributes) settings.filterableAttributes = def.filterableAttributes;
  if (def.sortableAttributes) settings.sortableAttributes = def.sortableAttributes;

  if (Object.keys(settings).length > 0) {
    const task = await idx.updateSettings(settings);
    await meili.tasks.waitForTask(task.taskUid);
    logger.debug(`Updated settings for index "${def.name}"`);
  }
}

export type SearchParams = {
  q?: string;
  filter?: string;
  sort?: string[];
  offset?: number;
  limit?: number;
};

export type SearchResult<T> = {
  hits: T[];
  total: number;
};

export function CreateSearchClient(indices: IndexDefinition[]) {
  @Injectable()
  class SearchClient implements OnModuleInit {
    public readonly client: Meilisearch;
    public readonly indices: IndexDefinition[];

    public constructor(connectionPool: SearchConnectionPool) {
      this.client = connectionPool.client;
      this.indices = indices;
    }

    public async onModuleInit() {
      await Promise.all(this.indices.map((def) => ensureIndex(this.client, def)));
    }

    public async addDocument<T extends Record<string, unknown>>(
      indexName: string,
      _id: string,
      document: T,
    ) {
      const idx = this.client.index(indexName);
      const enqueued = await idx.addDocuments([document]);
      const task = await this.client.tasks.waitForTask(enqueued.taskUid);
      assertTaskSucceeded(task);
    }

    public async bulkIndex<T extends Record<string, unknown>>(
      indexName: string,
      docs: Array<{ id: string; document: T }>,
    ) {
      const idx = this.client.index(indexName);
      const documents = docs.map(({ document }) => document);
      const enqueued = await idx.addDocuments(documents);
      const task = await this.client.tasks.waitForTask(enqueued.taskUid);
      assertTaskSucceeded(task);
    }

    public async deleteDoc(indexName: string, id: string) {
      const idx = this.client.index(indexName);
      const enqueued = await idx.deleteDocument(id);
      const task = await this.client.tasks.waitForTask(enqueued.taskUid);
      assertTaskSucceeded(task);
    }

    public async search<T extends Record<string, unknown>>(
      indexName: string,
      searchParams: SearchParams,
    ): Promise<SearchResult<T>> {
      const idx = this.client.index(indexName);
      const response: SearchResponse<T> = await idx.search(searchParams.q ?? '', {
        filter: searchParams.filter,
        sort: searchParams.sort,
        offset: searchParams.offset,
        limit: searchParams.limit,
      });

      return {
        hits: response.hits,
        total: response.estimatedTotalHits ?? 0,
      };
    }
  }

  return SearchClient;
}

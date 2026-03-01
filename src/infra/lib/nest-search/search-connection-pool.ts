import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Meilisearch } from 'meilisearch';

import { MODULE_OPTIONS_TOKEN, type SearchModuleOptions } from './search-module.js';

@Injectable()
export class SearchConnectionPool implements OnModuleDestroy {
  public readonly client: Meilisearch;

  public constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    config: SearchModuleOptions,
  ) {
    this.client = new Meilisearch({
      host: config.host,
      apiKey: config.apiKey,
    });
  }

  public async onModuleDestroy() {
    // Meilisearch JS client has no close method
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.health();
      return result.status === 'available';
    } catch {
      return false;
    }
  }
}

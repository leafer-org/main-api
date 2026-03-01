import { Client } from '@elastic/elasticsearch';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import { MODULE_OPTIONS_TOKEN, type SearchModuleOptions } from './search-module.js';

@Injectable()
export class SearchConnectionPool implements OnModuleDestroy {
  public readonly client: Client;

  public constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    config: SearchModuleOptions,
  ) {
    this.client = new Client({
      node: config.node,
      auth: {
        username: config.username,
        password: config.password,
      },
    });
  }

  public async onModuleDestroy() {
    await this.client.close();
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}

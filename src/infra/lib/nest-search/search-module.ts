import { ConfigurableModuleBuilder, Module } from '@nestjs/common';

import type { CreateSearchClient } from './create-search-client.js';
import { SearchConnectionPool } from './search-connection-pool.js';

export type SearchModuleOptions = {
  node: string;
  username: string;
  password: string;
};

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<SearchModuleOptions>()
    .setExtras(
      {
        isGlobal: false,
        clients: [] as ReturnType<typeof CreateSearchClient>[],
      },
      (definition, extras) => {
        const providers = [...(definition.providers ?? []), SearchConnectionPool];
        const exports = [...(definition.exports ?? []), SearchConnectionPool];

        for (const client of extras.clients) {
          providers.push(client);
          exports.push(client);
        }

        return { ...definition, providers, exports, global: extras.isGlobal };
      },
    )
    .build();

export { MODULE_OPTIONS_TOKEN };

@Module({})
export class SearchModule extends ConfigurableModuleClass {}

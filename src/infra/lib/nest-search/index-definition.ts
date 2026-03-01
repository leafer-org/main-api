import type { estypes } from '@elastic/elasticsearch';

export type IndexDefinition = {
  name: string;
  settings?: estypes.IndicesIndexSettings;
  mappings: estypes.MappingTypeMapping;
};

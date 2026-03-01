export type IndexDefinition = {
  name: string;
  primaryKey: string;
  searchableAttributes?: string[];
  filterableAttributes?: string[];
  sortableAttributes?: string[];
};

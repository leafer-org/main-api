export type FilterType =
  | 'json-logic'
  | 'every-nth'
  | 'random-sample';

export type FilterCategory = 'open' | 'close' | 'redirect';

export type SubscriptionFilter =
  | { type: 'json-logic'; rule: Record<string, unknown> }
  | { type: 'every-nth'; n: number }
  | { type: 'random-sample'; percent: number };

export type FilterParam = {
  key: string;
  label: string;
  type: 'number' | 'string';
};

export type FilterMeta = {
  name: string;
  categories: FilterCategory[];
  params: FilterParam[];
};

export const FILTER_META: Record<FilterType, FilterMeta> = {
  'json-logic': {
    name: 'JSON Logic',
    categories: ['open', 'close', 'redirect'],
    params: [],
  },
  'every-nth': {
    name: 'Каждый N-й',
    categories: ['open'],
    params: [{ key: 'n', label: 'N', type: 'number' }],
  },
  'random-sample': {
    name: 'Случайная выборка %',
    categories: ['open'],
    params: [{ key: 'percent', label: 'Процент', type: 'number' }],
  },
};

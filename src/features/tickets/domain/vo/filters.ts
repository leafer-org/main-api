import type { TriggerId } from './triggers.js';

// --- Programmatic filter IDs ---

export type UniversalFilterId = 'every-nth' | 'random-sample';
export type OrgFilterId = 'first-time-org' | 'repeat-offender';
export type ItemFilterId = 'high-price';

export type ProgrammaticFilterId = UniversalFilterId | OrgFilterId | ItemFilterId;

// --- Trigger → allowed filters mapping ---

export type TriggerFilters = {
  'item.moderation-requested': UniversalFilterId | OrgFilterId | ItemFilterId;
  'organization.moderation-requested': UniversalFilterId | OrgFilterId;
};

// --- Filter metadata (for UI) ---

export const FILTER_META: Record<
  ProgrammaticFilterId,
  { name: string; params: { key: string; label: string; type: 'number' }[] }
> = {
  'every-nth': {
    name: 'Каждый N-й',
    params: [{ key: 'n', label: 'N', type: 'number' }],
  },
  'random-sample': {
    name: 'Случайная выборка %',
    params: [{ key: 'percent', label: 'Процент', type: 'number' }],
  },
  'first-time-org': {
    name: 'Первая публикация организации',
    params: [],
  },
  'repeat-offender': {
    name: 'Организация с историей отклонений',
    params: [],
  },
  'high-price': {
    name: 'Цена выше порога',
    params: [{ key: 'threshold', label: 'Порог', type: 'number' }],
  },
};

// --- Subscription filter types ---

export type SubscriptionFilter =
  | { type: 'json-logic'; rule: unknown }
  | { type: 'programmatic'; filterId: string; params: Record<string, unknown> };


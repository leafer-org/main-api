export type TriggerId =
  | 'item-moderation.requested'
  | 'item-moderation.approved'
  | 'item-moderation.rejected'
  | 'organization-moderation.requested'
  | 'organization-moderation.approved'
  | 'organization-moderation.rejected'
  | 'timer.since-created'
  | 'timer.since-status';

export type TriggerCategory = 'open' | 'close' | 'redirect';

export type TriggerParam = {
  key: string;
  label: string;
  type: 'number' | 'string';
};

export type TriggerMeta = {
  name: string;
  categories: TriggerCategory[];
  params: TriggerParam[];
};

const VALID_TRIGGER_IDS = new Set<string>([
  'item-moderation.requested',
  'item-moderation.approved',
  'item-moderation.rejected',
  'organization-moderation.requested',
  'organization-moderation.approved',
  'organization-moderation.rejected',
  'timer.since-created',
  'timer.since-status',
]);

export const TriggerId = {
  parse(value: string): TriggerId | null {
    return VALID_TRIGGER_IDS.has(value) ? (value as TriggerId) : null;
  },
};

export const TRIGGER_META: Record<TriggerId, TriggerMeta> = {
  'item-moderation.requested': {
    name: 'Запрос модерации товара',
    categories: ['open'],
    params: [],
  },
  'item-moderation.approved': {
    name: 'Модерация товара одобрена',
    categories: ['open', 'close', 'redirect'],
    params: [],
  },
  'item-moderation.rejected': {
    name: 'Модерация товара отклонена',
    categories: ['open', 'close', 'redirect'],
    params: [],
  },
  'organization-moderation.requested': {
    name: 'Запрос модерации организации',
    categories: ['open'],
    params: [],
  },
  'organization-moderation.approved': {
    name: 'Модерация организации одобрена',
    categories: ['open', 'close', 'redirect'],
    params: [],
  },
  'organization-moderation.rejected': {
    name: 'Модерация организации отклонена',
    categories: ['open', 'close', 'redirect'],
    params: [],
  },
  'timer.since-created': {
    name: 'Время после создания тикета',
    categories: ['close', 'redirect'],
    params: [{ key: 'duration', label: 'Длительность (мин)', type: 'number' }],
  },
  'timer.since-status': {
    name: 'Время после смены статуса',
    categories: ['close', 'redirect'],
    params: [{ key: 'duration', label: 'Длительность (мин)', type: 'number' }],
  },
};

export type TriggerId = 'item.moderation-requested' | 'organization.moderation-requested';

export type TriggerScope = 'platform' | 'organization';

export const TRIGGER_META: Record<TriggerId, { name: string; scope: TriggerScope }> = {
  'item.moderation-requested': { name: 'Модерация товара', scope: 'platform' },
  'organization.moderation-requested': { name: 'Модерация организации', scope: 'platform' },
};

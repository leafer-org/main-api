import type { SubscriptionFilter } from '../../../vo/filters.js';
import type { TriggerId } from '../../../vo/triggers.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { BoardSubscriptionId } from '@/kernel/domain/ids.js';

export type BoardSubscriptionEntity = EntityState<{
  id: BoardSubscriptionId;
  triggerId: TriggerId;
  filters: SubscriptionFilter[];
}>;

export const BoardSubscriptionEntity = {
  create(
    id: BoardSubscriptionId,
    triggerId: TriggerId,
    filters: SubscriptionFilter[],
  ): BoardSubscriptionEntity {
    return { id, triggerId, filters };
  },

  findByTrigger(
    subscriptions: BoardSubscriptionEntity[],
    triggerId: TriggerId,
  ): BoardSubscriptionEntity[] {
    return subscriptions.filter((s) => s.triggerId === triggerId);
  },
};

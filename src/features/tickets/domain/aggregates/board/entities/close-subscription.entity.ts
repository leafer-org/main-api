import type { SubscriptionFilter } from '../../../vo/filters.js';
import type { TriggerId } from '../../../vo/triggers.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { BoardCloseSubscriptionId } from '@/kernel/domain/ids.js';

export type CloseSubscriptionEntity = EntityState<{
  id: BoardCloseSubscriptionId;
  triggerId: TriggerId;
  filters: SubscriptionFilter[];
  addComment: boolean;
}>;

export const CloseSubscriptionEntity = {
  create(
    id: BoardCloseSubscriptionId,
    triggerId: TriggerId,
    filters: SubscriptionFilter[],
    addComment: boolean,
  ): CloseSubscriptionEntity {
    return { id, triggerId, filters, addComment };
  },
};

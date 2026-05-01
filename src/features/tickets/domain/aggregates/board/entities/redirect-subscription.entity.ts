import type { SubscriptionFilter } from '../../../vo/filters.js';
import type { TriggerId } from '../../../vo/triggers.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { BoardId, BoardRedirectSubscriptionId } from '@/kernel/domain/ids.js';

export type RedirectSubscriptionEntity = EntityState<{
  id: BoardRedirectSubscriptionId;
  triggerId: TriggerId;
  filters: SubscriptionFilter[];
  targetBoardId: BoardId;
  addComment: boolean;
  commentTemplate: string;
}>;

export const RedirectSubscriptionEntity = {
  create(params: {
    id: BoardRedirectSubscriptionId;
    triggerId: TriggerId;
    filters: SubscriptionFilter[];
    targetBoardId: BoardId;
    addComment: boolean;
    commentTemplate: string;
  }): RedirectSubscriptionEntity {
    return params;
  },
};

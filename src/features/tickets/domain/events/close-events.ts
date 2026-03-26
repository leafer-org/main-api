import type { TriggerId } from '../vo/triggers.js';

export type ModerationResolvedCloseEvent = {
  type: 'moderation.approved' | 'moderation.rejected';
  entityType: 'organization' | 'item';
  entityId: string;
};

export type CloseEvent = ModerationResolvedCloseEvent;

export function mapCloseEventToTrigger(event: CloseEvent): {
  triggerId: TriggerId;
  entityId: string;
  resolution: 'approved' | 'rejected';
} {
  const triggerId: TriggerId =
    event.entityType === 'item'
      ? 'item.moderation-requested'
      : 'organization.moderation-requested';

  return {
    triggerId,
    entityId: event.entityId,
    resolution: event.type === 'moderation.approved' ? 'approved' : 'rejected',
  };
}

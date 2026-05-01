import type { TriggerId } from '../vo/triggers.js';

export type ModerationResolvedCloseEvent = {
  type: 'moderation.approved' | 'moderation.rejected';
  entityType: 'organization' | 'item';
  entityId: string;
};

export type CloseEvent = ModerationResolvedCloseEvent;

/**
 * Maps a close event to the close/redirect trigger ID.
 * These trigger IDs match close and redirect subscriptions on boards.
 */
export function mapCloseEventToTrigger(event: CloseEvent): {
  triggerId: TriggerId;
  entityId: string;
  resolution: 'approved' | 'rejected';
} {
  const resolution = event.type === 'moderation.approved' ? 'approved' : 'rejected';

  let triggerId: TriggerId;
  if (event.entityType === 'item') {
    triggerId = resolution === 'approved' ? 'item-moderation.approved' : 'item-moderation.rejected';
  } else {
    triggerId =
      resolution === 'approved'
        ? 'organization-moderation.approved'
        : 'organization-moderation.rejected';
  }

  return { triggerId, entityId: event.entityId, resolution };
}

/**
 * Returns the open trigger ID that was used to create tickets for this entity type.
 * Tickets are looked up by this trigger ID + entity ID.
 */
export function getOpenTriggerId(event: CloseEvent): TriggerId {
  return event.entityType === 'item'
    ? 'item-moderation.requested'
    : 'organization-moderation.requested';
}

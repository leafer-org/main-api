import type { ItemId, UserId } from '../ids.js';

export type InteractionType =
  | 'view'
  | 'click'
  | 'like'
  | 'unlike'
  | 'review'
  | 'show-contacts'
  | 'contact-click'
  | 'purchase'
  | 'booking';

export type InteractionRecordedEvent = {
  id: string;
  type: 'interaction.recorded';
  userId: UserId;
  itemId: ItemId;
  interactionType: InteractionType;
  metadata?: Record<string, unknown>;
  timestamp: Date;
};

export type UserInteractionIntegrationEvent = InteractionRecordedEvent;

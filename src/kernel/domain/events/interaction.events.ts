import type { ItemId, UserId } from '../ids.js';

export type InteractionType = 'view' | 'click' | 'like' | 'unlike' | 'purchase' | 'booking';

export type InteractionRecordedEvent = {
  id: string;
  type: 'interaction.recorded';
  userId: UserId;
  itemId: ItemId;
  interactionType: InteractionType;
  timestamp: Date;
};

export type UserInteractionIntegrationEvent = InteractionRecordedEvent;

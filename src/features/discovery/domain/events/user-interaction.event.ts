import type { ServiceId, UserId } from '@/kernel/domain/ids.js';

export type InteractionType = 'view' | 'click' | 'like' | 'purchase' | 'booking';

export type UserInteractionEvent = {
  userId: UserId;
  itemId: ServiceId;
  interactionType: InteractionType;
  timestamp: Date;
};

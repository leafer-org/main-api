import type { InteractionType } from '@/kernel/domain/events/interaction.events.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

export type Interaction = {
  id: string;
  userId: UserId;
  itemId: ItemId;
  type: InteractionType;
  timestamp: Date;
};

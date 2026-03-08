import type { ItemId, UserId } from '../ids.js';

export type ItemLikedEvent = {
  id: string;
  type: 'item.liked';
  userId: UserId;
  itemId: ItemId;
  timestamp: Date;
};

export type ItemUnlikedEvent = {
  id: string;
  type: 'item.unliked';
  userId: UserId;
  itemId: ItemId;
  timestamp: Date;
};

export type UserLikeIntegrationEvent = ItemLikedEvent | ItemUnlikedEvent;

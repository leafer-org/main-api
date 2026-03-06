import type { ItemListView } from './item-list-view.read-model.js';

export type LikedItemView = ItemListView & {
  likedAt: Date;
};

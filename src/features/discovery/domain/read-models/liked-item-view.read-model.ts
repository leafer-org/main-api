import type { ItemListView } from './item-list-view.read-model.js';

/**
 * Карточка лайкнутого товара. Просроченные товары не исключаются —
 * пользователь должен видеть всё, что лайкнул.
 */
export type LikedItemView = ItemListView & {
  likedAt: Date;
};

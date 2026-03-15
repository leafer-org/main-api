import type { ItemReadModel } from '../read-models/item.read-model.js';
import type { ItemListView } from '../read-models/item-list-view.read-model.js';

/** ItemReadModel → ItemListView. Переиспользуется всеми interactors, возвращающими списки товаров. */
export function toListView(item: ItemReadModel): ItemListView {
  return {
    itemId: item.itemId,
    typeId: item.typeId,
    title: item.baseInfo?.title ?? '',
    description: item.baseInfo?.description ?? null,
    media: item.baseInfo?.media ?? [],
    price: item.payment ?? null,
    rating: item.itemReview?.rating ?? null,
    reviewCount: item.itemReview?.reviewCount ?? 0,
    owner: item.owner ? { name: item.owner.name, avatarId: item.owner.avatarId } : null,
    location: item.location
      ? { cityId: item.location.cityId, address: item.location.address }
      : null,
    categoryIds: item.category?.categoryIds ?? [],
  };
}

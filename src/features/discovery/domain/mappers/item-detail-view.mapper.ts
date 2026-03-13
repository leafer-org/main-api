import type { ItemReadModel } from '../read-models/item.read-model.js';
import type { ItemDetailView, ItemWidgetView } from '../read-models/item-detail-view.read-model.js';

/** ItemReadModel → ItemDetailView. Собирает ItemWidgetView[] из optional-полей read model. */
export function toDetailView(item: ItemReadModel): ItemDetailView {
  const widgets: ItemWidgetView[] = [];

  if (item.baseInfo) {
    widgets.push({
      type: 'base-info',
      title: item.baseInfo.title,
      description: item.baseInfo.description,
      imageId: item.baseInfo.imageId,
    });
  }

  if (item.ageGroup) {
    widgets.push({ type: 'age-group', value: item.ageGroup });
  }

  if (item.location) {
    widgets.push({
      type: 'location',
      cityId: item.location.cityId,
      lat: item.location.coordinates.lat,
      lng: item.location.coordinates.lng,
      address: item.location.address,
    });
  }

  if (item.payment) {
    widgets.push({
      type: 'payment',
      strategy: item.payment.strategy,
      price: item.payment.price,
    });
  }

  if (item.category) {
    widgets.push({ type: 'category', categoryIds: item.category.categoryIds });
  }

  if (item.owner) {
    widgets.push({
      type: 'owner',
      organizationId: item.owner.organizationId,
      name: item.owner.name,
      avatarId: item.owner.avatarId,
    });
  }

  if (item.itemReview) {
    widgets.push({
      type: 'item-review',
      rating: item.itemReview.rating,
      reviewCount: item.itemReview.reviewCount,
    });
  }

  if (item.ownerReview) {
    widgets.push({
      type: 'owner-review',
      rating: item.ownerReview.rating,
      reviewCount: item.ownerReview.reviewCount,
    });
  }

  if (item.eventDateTime) {
    widgets.push({
      type: 'event-date-time',
      dates: item.eventDateTime.dates.map((d) => d.toISOString()),
    });
  }

  if (item.schedule) {
    widgets.push({ type: 'schedule', entries: item.schedule.entries });
  }

  return {
    itemId: item.itemId,
    typeId: item.typeId,
    widgets,
    publishedAt: item.publishedAt,
  };
}

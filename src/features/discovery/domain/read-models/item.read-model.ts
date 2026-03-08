import type { ItemPublishedEvent } from '@/kernel/domain/events/item.events.js';
import type {
  AttributeId,
  CategoryId,
  FileId,
  ItemId,
  OrganizationId,
  TypeId,
} from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';
import type { PaymentStrategy, ScheduleEntry } from '@/kernel/domain/vo/widget.js';

export type ItemBaseInfo = {
  title: string;
  description: string;
  imageId: FileId | null;
};

export type ItemLocation = {
  cityId: string;
  coordinates: { lat: number; lng: number };
  address: string | null;
};

export type ItemPayment = {
  strategy: PaymentStrategy;
  price: number | null;
};

export type ItemCategory = {
  categoryIds: CategoryId[];
  attributeValues: { attributeId: AttributeId; value: string }[];
};

export type ItemOwner = {
  organizationId: OrganizationId;
  name: string;
  avatarId: FileId | null;
};

export type ItemReview = {
  rating: number | null;
  reviewCount: number;
};

/**
 * Денормализованная проекция товара. Все блоки виджетов optional — зависят от типа товара.
 * Owner денормализован в item для быстрого отображения в карточке.
 * При обновлении owner — данные каскадно обновляются через ProjectOwnerHandler.
 */
export type ItemReadModel = {
  itemId: ItemId;
  typeId: TypeId;

  baseInfo?: ItemBaseInfo;
  ageGroup?: AgeGroup;
  location?: ItemLocation;
  payment?: ItemPayment;
  category?: ItemCategory;
  owner?: ItemOwner;
  itemReview?: ItemReview;
  ownerReview?: ItemReview;
  eventDateTime?: { dates: Date[] };
  schedule?: { entries: ScheduleEntry[] };

  publishedAt: Date;
  updatedAt: Date;
};

/** Извлекает данные из массива виджетов {@link ItemPublishedEvent} в плоскую структуру. */
export function projectItemFromEvent(event: ItemPublishedEvent): ItemReadModel {
  const model: ItemReadModel = {
    itemId: event.itemId,
    typeId: event.typeId,
    publishedAt: event.publishedAt,
    updatedAt: event.publishedAt,
  };

  for (const widget of event.widgets) {
    switch (widget.type) {
      case 'base-info':
        model.baseInfo = {
          title: widget.title,
          description: widget.description,
          imageId: widget.imageId,
        };
        break;
      case 'age-group':
        model.ageGroup = widget.value;
        break;
      case 'location':
        model.location = {
          cityId: widget.cityId,
          coordinates: { lat: widget.lat, lng: widget.lng },
          address: widget.address,
        };
        break;
      case 'payment':
        model.payment = { strategy: widget.strategy, price: widget.price };
        break;
      case 'category':
        model.category = {
          categoryIds: widget.categoryIds,
          attributeValues: widget.attributes,
        };
        break;
      case 'owner':
        model.owner = {
          organizationId: widget.organizationId,
          name: widget.name,
          avatarId: widget.avatarId,
        };
        break;
      case 'item-review':
        model.itemReview = { rating: widget.rating, reviewCount: widget.reviewCount };
        break;
      case 'owner-review':
        model.ownerReview = { rating: widget.rating, reviewCount: widget.reviewCount };
        break;
      case 'event-date-time':
        model.eventDateTime = { dates: widget.dates.map((d) => new Date(d)) };
        break;
      case 'schedule':
        model.schedule = { entries: widget.entries };
        break;
      default:
        break;
    }
  }
  return model;
}

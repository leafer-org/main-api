import { h3Labels } from '@/infra/lib/geo/h3-geo.js';
import type { ItemPublishedEvent } from '@/kernel/domain/events/item.events.js';
import type {
  AttributeId,
  CategoryId,
  MediaId,
  ItemId,
  OrganizationId,
  TypeId,
} from '@/kernel/domain/ids.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';
import type { PaymentStrategy, ScheduleEntry } from '@/kernel/domain/vo/widget.js';

export type ItemBaseInfo = {
  title: string;
  description: string;
  media: MediaItem[];
};

export type ItemLocation = {
  cityId: string;
  coordinates: { lat: number; lng: number };
  address: string | null;
};

export type ItemPaymentOption = {
  name: string;
  description: string | null;
  strategy: PaymentStrategy;
  price: number | null;
};

export type ItemPayment = {
  options: ItemPaymentOption[];
};

export type ItemCategory = {
  categoryIds: CategoryId[];
  attributeValues: { attributeId: AttributeId; value: string }[];
};

export type ItemOwner = {
  organizationId: OrganizationId;
  name: string;
  avatarId: MediaId | null;
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
  ageGroup?: AgeGroupOption;
  location?: ItemLocation;
  payment?: ItemPayment;
  category?: ItemCategory;
  owner?: ItemOwner;
  itemReview?: ItemReview;
  ownerReview?: ItemReview;
  eventDateTime?: { dates: { date: Date; label?: string }[] };
  schedule?: { entries: ScheduleEntry[] };

  /** Raw widgets for detail view — stored as-is, not used for filtering */
  widgets: ItemWidget[];

  publishedAt: Date;
  updatedAt: Date;
};

const PRICE_LOW_THRESHOLD = 1000;
const PRICE_MEDIUM_THRESHOLD = 5000;

function minPrice(payment: ItemPayment): { strategy: PaymentStrategy; price: number | null } | null {
  if (payment.options.length === 0) return null;
  let best = payment.options[0]!;
  for (const opt of payment.options) {
    if (opt.strategy === 'free') return opt;
    if (opt.price !== null && (best.price === null || opt.price < best.price)) best = opt;
  }
  return best;
}

function priceTierLabel(payment: ItemPayment): string {
  const cheapest = minPrice(payment);
  if (
    !cheapest ||
    cheapest.strategy === 'free' ||
    cheapest.price === null ||
    cheapest.price === undefined ||
    cheapest.price === 0
  ) {
    return 'price:free';
  }
  if (cheapest.price < PRICE_LOW_THRESHOLD) return 'price:low';
  if (cheapest.price < PRICE_MEDIUM_THRESHOLD) return 'price:medium';
  return 'price:high';
}

function ratingTierLabel(ratingValue: number): string | null {
  if (ratingValue >= 4.9) return 'rating:high';
  if (ratingValue >= 4.5) return 'rating:medium';
  if (ratingValue >= 4) return 'rating:low';
  if (ratingValue >= 3) return 'rating:super-low';
  return null;
}

/** Gorse item labels: city, age, type, attributes, payment, price tier, schedule, event, rating. */
export function toGorseLabels(item: ItemReadModel): string[] {
  const labels: string[] = [];

  if (item.location?.cityId) labels.push(`city:${item.location.cityId}`);
  if (item.location?.coordinates) {
    labels.push(...h3Labels(item.location.coordinates.lat, item.location.coordinates.lng));
  }
  if (item.ageGroup) labels.push(`age:${item.ageGroup}`);
  if (item.typeId) labels.push(`type:${String(item.typeId)}`);

  if (item.category?.attributeValues) {
    for (const av of item.category.attributeValues) {
      labels.push(`attr:${String(av.attributeId)}:${av.value}`);
    }
  }

  if (item.payment?.options) {
    for (const opt of item.payment.options) {
      labels.push(`payment:${opt.strategy}`);
    }
  }
  if (item.payment) {
    labels.push(priceTierLabel(item.payment));
  }

  if (item.schedule?.entries && item.schedule.entries.length > 0) {
    labels.push('schedule:true');
  }
  if (item.eventDateTime?.dates && item.eventDateTime.dates.length > 0) {
    labels.push('event:true');
  }

  const itemRating = item.itemReview?.rating;
  if (itemRating !== null && itemRating !== undefined) {
    const tier = ratingTierLabel(itemRating);
    if (tier) labels.push(tier);
  }

  if (item.baseInfo?.media?.some((m) => m.type === 'video')) {
    labels.push('media:video');
  }

  return labels;
}

/** Извлекает данные из массива виджетов {@link ItemPublishedEvent} в плоскую структуру. */
export function projectItemFromEvent(event: ItemPublishedEvent): ItemReadModel {
  const model: ItemReadModel = {
    itemId: event.itemId,
    typeId: event.typeId,
    widgets: event.widgets,
    publishedAt: event.publishedAt,
    updatedAt: event.publishedAt,
  };

  for (const widget of event.widgets) {
    switch (widget.type) {
      case 'base-info':
        model.baseInfo = {
          title: widget.title,
          description: widget.description,
          media: widget.media,
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
        model.payment = { options: widget.options };
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
        model.eventDateTime = { dates: widget.dates.map((d) => ({ date: new Date(d.date), label: d.label })) };
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

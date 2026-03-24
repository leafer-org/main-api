import { AttributeId, CategoryId, MediaId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { PublicSchemas } from '@/infra/contracts/types.js';

export function toItemWidget(w: PublicSchemas['ItemWidgetInput']): ItemWidget {
  switch (w.type) {
    case 'base-info':
      return { type: 'base-info', title: w.title, description: w.description, media: w.media.map((m) => ({ type: m.type, mediaId: MediaId.raw(m.mediaId) })) };
    case 'age-group':
      return { type: 'age-group', value: AgeGroupOption.restore(w.value) };
    case 'location':
      return { type: 'location', cityId: w.cityId, lat: w.lat, lng: w.lng, address: w.address ?? null };
    case 'payment':
      return { type: 'payment', options: w.options.map((o) => ({ name: o.name, description: o.description ?? null, strategy: o.strategy, price: o.price ?? null })) };
    case 'category':
      return { type: 'category', categoryIds: w.categoryIds.map((id) => CategoryId.raw(id)), attributes: (w.attributes ?? []).map((a) => ({ attributeId: AttributeId.raw(a.attributeId), value: a.value })) };
    case 'event-date-time':
      return { type: 'event-date-time', dates: w.dates };
    case 'schedule':
      return { type: 'schedule', entries: w.entries };
    case 'contact-info':
      return { type: 'contact-info', contacts: w.contacts };
  }
}

/** Domain → API boundary. Branded types are structurally strings at runtime. */
export function toSchemaWidget(w: ItemWidget): PublicSchemas['ItemWidget'] {
  return w
}

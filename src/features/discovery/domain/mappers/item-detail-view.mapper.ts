import type { ItemWidget } from '@/kernel/domain/vo/widget.js';
import type { ItemReadModel } from '../read-models/item.read-model.js';
import type { ItemDetailView, ItemWidgetView } from '../read-models/item-detail-view.read-model.js';

function toWidgetView(w: ItemWidget): ItemWidgetView {
  if (w.type === 'event-date-time') {
    return {
      type: 'event-date-time',
      dates: w.dates.map((d) => ({ date: typeof d.date === 'string' ? d.date : (d.date as unknown as Date).toISOString(), label: d.label })),
    };
  }
  return w as ItemWidgetView;
}

/** ItemReadModel → ItemDetailView. */
export function toDetailView(item: ItemReadModel): ItemDetailView {
  const hasVideo = (item.baseInfo?.media ?? []).some((m) => m.type === 'video');

  return {
    itemId: item.itemId,
    typeId: item.typeId,
    widgets: item.widgets.map(toWidgetView),
    hasVideo,
    publishedAt: item.publishedAt,
  };
}

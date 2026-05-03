import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import { ItemCardEnrichmentPort } from '../../../application/ports.js';
import type { ItemCardEnrichment } from '../../../domain/read-models/item-list-view.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryItems, discoveryItemTypes } from '../schema.js';
import { Clock } from '@/infra/lib/clock.js';
import type { ItemId, TypeId } from '@/kernel/domain/ids.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';
import { isShownOnCard } from '@/kernel/domain/vo/widget-settings.js';

function nextOccurrenceMinutes(
  nowDayOfWeek: number,
  nowMinutes: number,
  slotDayOfWeek: number,
  slotStartMinutes: number,
): number {
  const dayDiff = (slotDayOfWeek - nowDayOfWeek + 7) % 7;
  const total = dayDiff * 24 * 60 + slotStartMinutes - nowMinutes;
  return total >= 0 ? total : total + 7 * 24 * 60;
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m ?? '0');
}

function pickEarliestFutureDate(widget: Extract<ItemWidget, { type: 'event-date-time' }>, now: Date): string | null {
  let earliest: Date | null = null;
  for (const d of widget.dates) {
    const date = new Date(d.date);
    if (date.getTime() > now.getTime() && (earliest === null || date < earliest)) {
      earliest = date;
    }
  }
  return earliest ? earliest.toISOString() : null;
}

function pickNextScheduleSlot(
  widget: Extract<ItemWidget, { type: 'schedule' }>,
  now: Date,
): { dayOfWeek: number; startTime: string; endTime: string } | null {
  if (widget.entries.length === 0) return null;
  const nowDayOfWeek = now.getUTCDay();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  let best: { offset: number; entry: typeof widget.entries[number] } | null = null;
  for (const entry of widget.entries) {
    const offset = nextOccurrenceMinutes(
      nowDayOfWeek,
      nowMinutes,
      entry.dayOfWeek,
      parseHHMM(entry.startTime),
    );
    if (best === null || offset < best.offset) best = { offset, entry };
  }
  if (!best) return null;
  return {
    dayOfWeek: best.entry.dayOfWeek,
    startTime: best.entry.startTime,
    endTime: best.entry.endTime,
  };
}

@Injectable()
export class DrizzleItemCardEnrichmentQuery implements ItemCardEnrichmentPort {
  public constructor(
    private readonly dbClient: DiscoveryDatabaseClient,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async enrich(input: {
    items: { itemId: ItemId; typeId: TypeId; widgets?: ItemWidget[] }[];
  }): Promise<Map<string, ItemCardEnrichment>> {
    const result = new Map<string, ItemCardEnrichment>();
    if (input.items.length === 0) return result;

    const uniqueTypeIds = [...new Set(input.items.map((i) => String(i.typeId)))];

    const typeRows = await this.dbClient.db
      .select({
        id: discoveryItemTypes.id,
        name: discoveryItemTypes.name,
        widgetSettings: discoveryItemTypes.widgetSettings,
      })
      .from(discoveryItemTypes)
      .where(inArray(discoveryItemTypes.id, uniqueTypeIds));

    const cardWidgetsByType = new Map<string, Set<WidgetSettings['type']>>();
    const typeNameById = new Map<string, string>();
    for (const row of typeRows) {
      const settings = (row.widgetSettings ?? []) as WidgetSettings[];
      const enabled = new Set<WidgetSettings['type']>();
      for (const s of settings) {
        if (isShownOnCard(s)) enabled.add(s.type);
      }
      cardWidgetsByType.set(row.id, enabled);
      typeNameById.set(row.id, row.name);
    }

    // Дочитываем widgets только для тех item-ов, у которых их нет в памяти (likes/search)
    const itemsMissingWidgets = input.items.filter((i) => i.widgets === undefined);
    const widgetsByItem = new Map<string, ItemWidget[]>();
    if (itemsMissingWidgets.length > 0) {
      const ids = itemsMissingWidgets.map((i) => String(i.itemId));
      const rows = await this.dbClient.db
        .select({ id: discoveryItems.id, widgets: discoveryItems.widgets })
        .from(discoveryItems)
        .where(inArray(discoveryItems.id, ids));
      for (const row of rows) {
        widgetsByItem.set(row.id, (row.widgets ?? []) as ItemWidget[]);
      }
    }

    const now = this.clock.now();

    for (const item of input.items) {
      const itemIdStr = String(item.itemId);
      const enabled = cardWidgetsByType.get(String(item.typeId)) ?? new Set();
      const widgets = item.widgets ?? widgetsByItem.get(itemIdStr) ?? [];

      let eventDateTime: string | null = null;
      let nextScheduleSlot: { dayOfWeek: number; startTime: string; endTime: string } | null = null;
      let cardAgeGroup: AgeGroupOption | null = null;

      for (const w of widgets) {
        if (w.type === 'event-date-time' && enabled.has('event-date-time')) {
          eventDateTime = pickEarliestFutureDate(w, now);
        } else if (w.type === 'schedule' && enabled.has('schedule')) {
          nextScheduleSlot = pickNextScheduleSlot(w, now);
        } else if (w.type === 'age-group' && enabled.has('age-group')) {
          cardAgeGroup = w.value;
        }
      }

      const typeName = typeNameById.get(String(item.typeId)) ?? '';
      result.set(itemIdStr, { typeName, eventDateTime, nextScheduleSlot, cardAgeGroup });
    }

    return result;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, gt, inArray } from 'drizzle-orm';

import { ItemCardEnrichmentPort } from '../../../application/ports.js';
import type { ItemCardEnrichment } from '../../../domain/read-models/item-list-view.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import {
  discoveryItemEventDates,
  discoveryItemSchedules,
  discoveryItems,
  discoveryItemTypes,
} from '../schema.js';
import { Clock } from '@/infra/lib/clock.js';
import type { ItemId, TypeId } from '@/kernel/domain/ids.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';
import { isShownOnCard } from '@/kernel/domain/vo/widget-settings.js';

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

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

@Injectable()
export class DrizzleItemCardEnrichmentQuery implements ItemCardEnrichmentPort {
  public constructor(
    private readonly dbClient: DiscoveryDatabaseClient,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async enrich(input: {
    items: { itemId: ItemId; typeId: TypeId }[];
    userLocation?: { lat: number; lng: number };
  }): Promise<Map<string, ItemCardEnrichment>> {
    const result = new Map<string, ItemCardEnrichment>();
    if (input.items.length === 0) return result;

    const uniqueTypeIds = [...new Set(input.items.map((i) => String(i.typeId)))];

    const typeRows = await this.dbClient.db
      .select({ id: discoveryItemTypes.id, widgetSettings: discoveryItemTypes.widgetSettings })
      .from(discoveryItemTypes)
      .where(inArray(discoveryItemTypes.id, uniqueTypeIds));

    const cardWidgetsByType = new Map<string, Set<WidgetSettings['type']>>();
    for (const row of typeRows) {
      const settings = (row.widgetSettings ?? []) as WidgetSettings[];
      const enabled = new Set<WidgetSettings['type']>();
      for (const s of settings) {
        if (isShownOnCard(s)) enabled.add(s.type);
      }
      cardWidgetsByType.set(row.id, enabled);
    }

    const itemsNeedingEvent: string[] = [];
    const itemsNeedingSchedule: string[] = [];
    const itemsNeedingLocation: string[] = [];
    const itemsNeedingAgeGroup: string[] = [];

    for (const item of input.items) {
      const enabled = cardWidgetsByType.get(String(item.typeId)) ?? new Set();
      const itemIdStr = String(item.itemId);
      if (enabled.has('event-date-time')) itemsNeedingEvent.push(itemIdStr);
      if (enabled.has('schedule')) itemsNeedingSchedule.push(itemIdStr);
      if (enabled.has('location') && input.userLocation) itemsNeedingLocation.push(itemIdStr);
      if (enabled.has('age-group')) itemsNeedingAgeGroup.push(itemIdStr);
    }

    const now = this.clock.now();

    const [eventDateMap, scheduleMap, coordMap, ageGroupMap] = await Promise.all([
      this.loadEventDates(itemsNeedingEvent, now),
      this.loadSchedules(itemsNeedingSchedule, now),
      this.loadCoordinates(itemsNeedingLocation),
      this.loadAgeGroups(itemsNeedingAgeGroup),
    ]);

    for (const item of input.items) {
      const itemIdStr = String(item.itemId);
      const enabled = cardWidgetsByType.get(String(item.typeId)) ?? new Set();

      const eventDateTime = enabled.has('event-date-time')
        ? (eventDateMap.get(itemIdStr) ?? null)
        : null;

      const nextScheduleSlot = enabled.has('schedule')
        ? (scheduleMap.get(itemIdStr) ?? null)
        : null;

      let distanceKm: number | null = null;
      if (enabled.has('location') && input.userLocation) {
        const coords = coordMap.get(itemIdStr);
        if (coords) {
          distanceKm = Math.round(haversineKm(input.userLocation, coords) * 10) / 10;
        }
      }

      const cardAgeGroup = enabled.has('age-group') ? (ageGroupMap.get(itemIdStr) ?? null) : null;

      result.set(itemIdStr, { eventDateTime, nextScheduleSlot, distanceKm, cardAgeGroup });
    }

    return result;
  }

  private async loadEventDates(itemIds: string[], now: Date): Promise<Map<string, string>> {
    if (itemIds.length === 0) return new Map();

    const rows = await this.dbClient.db
      .select({
        itemId: discoveryItemEventDates.itemId,
        eventDate: discoveryItemEventDates.eventDate,
      })
      .from(discoveryItemEventDates)
      .where(
        and(
          inArray(discoveryItemEventDates.itemId, itemIds),
          gt(discoveryItemEventDates.eventDate, now),
        ),
      );

    const earliest = new Map<string, Date>();
    for (const row of rows) {
      const prev = earliest.get(row.itemId);
      if (!prev || row.eventDate < prev) earliest.set(row.itemId, row.eventDate);
    }
    return new Map([...earliest].map(([id, date]) => [id, date.toISOString()]));
  }

  private async loadSchedules(
    itemIds: string[],
    now: Date,
  ): Promise<Map<string, { dayOfWeek: number; startTime: string; endTime: string }>> {
    if (itemIds.length === 0) return new Map();

    const rows = await this.dbClient.db
      .select({
        itemId: discoveryItemSchedules.itemId,
        dayOfWeek: discoveryItemSchedules.dayOfWeek,
        startTime: discoveryItemSchedules.startTime,
        endTime: discoveryItemSchedules.endTime,
      })
      .from(discoveryItemSchedules)
      .where(inArray(discoveryItemSchedules.itemId, itemIds));

    const nowDayOfWeek = now.getUTCDay();
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

    const best = new Map<
      string,
      { dayOfWeek: number; startTime: string; endTime: string; offset: number }
    >();
    for (const row of rows) {
      const offset = nextOccurrenceMinutes(
        nowDayOfWeek,
        nowMinutes,
        row.dayOfWeek,
        parseHHMM(row.startTime),
      );
      const prev = best.get(row.itemId);
      if (!prev || offset < prev.offset) {
        best.set(row.itemId, {
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          offset,
        });
      }
    }

    return new Map(
      [...best].map(([id, slot]) => [
        id,
        { dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime },
      ]),
    );
  }

  private async loadCoordinates(
    itemIds: string[],
  ): Promise<Map<string, { lat: number; lng: number }>> {
    if (itemIds.length === 0) return new Map();

    const rows = await this.dbClient.db
      .select({ id: discoveryItems.id, lat: discoveryItems.lat, lng: discoveryItems.lng })
      .from(discoveryItems)
      .where(inArray(discoveryItems.id, itemIds));

    const map = new Map<string, { lat: number; lng: number }>();
    for (const row of rows) {
      if (row.lat !== null && row.lng !== null) map.set(row.id, { lat: row.lat, lng: row.lng });
    }
    return map;
  }

  private async loadAgeGroups(itemIds: string[]): Promise<Map<string, AgeGroupOption>> {
    if (itemIds.length === 0) return new Map();

    const rows = await this.dbClient.db
      .select({ id: discoveryItems.id, ageGroup: discoveryItems.ageGroup })
      .from(discoveryItems)
      .where(inArray(discoveryItems.id, itemIds));

    const map = new Map<string, AgeGroupOption>();
    for (const row of rows) {
      if (row.ageGroup === 'adults' || row.ageGroup === 'children' || row.ageGroup === 'all') {
        map.set(row.id, AgeGroupOption.restore(row.ageGroup));
      }
    }
    return map;
  }
}

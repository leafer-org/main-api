import type { CategoryItemFilters } from '../../application/use-cases/browse-category/types.js';
import type { ItemReadModel } from '../read-models/item.read-model.js';

const EARTH_RADIUS_KM = 6371;

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

export function filterItems(items: ItemReadModel[], filters: CategoryItemFilters): ItemReadModel[] {
  let result = items;

  if (filters.typeIds && filters.typeIds.length > 0) {
    const typeSet = new Set(filters.typeIds.map(String));
    result = result.filter((item) => typeSet.has(String(item.typeId)));
  }

  if (filters.priceRange) {
    const { min, max } = filters.priceRange;
    result = result.filter((item) => {
      if (!item.payment || item.payment.options.length === 0) return false;
      return item.payment.options.some((opt) => {
        if (opt.strategy === 'free') return min === undefined || min === 0;
        if (opt.price === null || opt.price === undefined) return false;
        if (min !== undefined && opt.price < min) return false;
        if (max !== undefined && opt.price > max) return false;
        return true;
      });
    });
  }

  if (filters.minRating !== undefined) {
    const minR = filters.minRating;
    result = result.filter((item) => {
      const rating = item.itemReview?.rating;
      return rating !== null && rating !== undefined && rating >= minR;
    });
  }

  if (filters.attributeFilters && filters.attributeFilters.length > 0) {
    for (const af of filters.attributeFilters) {
      result = result.filter((item) => {
        const attrs = item.category?.attributeValues;
        if (!attrs) return false;

        const itemValues = attrs.filter((a) => String(a.attributeId) === String(af.attributeId));
        if (itemValues.length === 0) return false;

        switch (af.type) {
          case 'enum':
            return itemValues.some((a) => af.values.includes(a.value));
          case 'number': {
            const first = itemValues[0];
            if (!first) return false;
            const num = Number(first.value);
            if (Number.isNaN(num)) return false;
            if (af.min !== undefined && num < af.min) return false;
            if (af.max !== undefined && num > af.max) return false;
            return true;
          }
          case 'boolean':
            return itemValues.some((a) => a.value === String(af.value));
          case 'text':
            return itemValues.some((a) => a.value.toLowerCase().includes(af.value.toLowerCase()));
          default:
            return true;
        }
      });
    }
  }

  if (filters.geoRadius) {
    const { lat, lng, radiusKm } = filters.geoRadius;
    result = result.filter((item) => {
      const coords = item.location?.coordinates;
      if (!coords) return false;
      return haversineDistance(lat, lng, coords.lat, coords.lng) <= radiusKm;
    });
  }

  if (filters.dateRange) {
    const { from, to } = filters.dateRange;
    result = result.filter((item) => {
      const dates = item.eventDateTime?.dates;
      if (!dates || dates.length === 0) return false;
      return dates.some((d) => d >= from && d <= to);
    });
  }

  if (filters.scheduleDayOfWeek !== undefined) {
    const day = filters.scheduleDayOfWeek;
    result = result.filter((item) => {
      const entries = item.schedule?.entries;
      if (!entries) return false;
      return entries.some((e) => e.dayOfWeek === day);
    });
  }

  if (filters.scheduleTimeOfDay) {
    const fromMin = timeToMinutes(filters.scheduleTimeOfDay.from);
    const toMin = timeToMinutes(filters.scheduleTimeOfDay.to);
    result = result.filter((item) => {
      const entries = item.schedule?.entries;
      if (!entries) return false;
      return entries.some((e) => {
        const start = timeToMinutes(e.startTime);
        const end = timeToMinutes(e.endTime);
        return start < toMin && end > fromMin;
      });
    });
  }

  return result;
}

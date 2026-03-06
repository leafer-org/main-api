import type { AttributeId, TypeId } from '@/kernel/domain/ids.js';

export type SortOption = 'personal' | 'price-asc' | 'price-desc' | 'rating-desc' | 'newest';

export type CategoryItemFilters = {
  attributeValues?: { attributeId: AttributeId; value: string }[];
  typeIds?: TypeId[];
  priceRange?: { min?: number; max?: number };
  minRating?: number;
  geoRadius?: { lat: number; lng: number; radiusKm: number };
  dateRange?: { from: Date; to: Date };
  scheduleDayOfWeek?: number;
  scheduleTimeOfDay?: { from: string; to: string };
};

import type { AttributeId, TypeId } from '@/kernel/domain/ids.js';

export type SortOption = 'personal' | 'price-asc' | 'price-desc' | 'rating-desc' | 'newest';

export type AttributeFilter =
  | { attributeId: AttributeId; type: 'enum'; values: string[] }
  | { attributeId: AttributeId; type: 'number'; min?: number; max?: number }
  | { attributeId: AttributeId; type: 'boolean'; value: boolean }
  | { attributeId: AttributeId; type: 'text'; value: string };

export type CategoryItemFilters = {
  attributeFilters?: AttributeFilter[];
  typeIds?: TypeId[];
  priceRange?: { min?: number; max?: number };
  minRating?: number;
  geoRadius?: { lat: number; lng: number; radiusKm: number };
  dateRange?: { from: Date; to: Date };
  scheduleDayOfWeek?: number;
  scheduleTimeOfDay?: { from: string; to: string };
};

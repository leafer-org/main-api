import type { AttributeId, CategoryId, TypeId } from '@/kernel/domain/ids.js';

export type DynamicSearchFilters = {
  categoryIds?: CategoryId[];
  typeIds?: TypeId[];
  priceRange?: { min?: number; max?: number };
  attributeValues?: { attributeId: AttributeId; value: string }[];
};

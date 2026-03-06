import type { AttributeId, CategoryId, TypeId } from '@/kernel/domain/ids.js';

export type SearchFacets = {
  categories: { categoryId: CategoryId; name: string; count: number }[];
  types: { typeId: TypeId; name: string; count: number }[];
  priceRange: { min: number; max: number } | null;
  attributes: {
    attributeId: AttributeId;
    name: string;
    values: { value: string; count: number }[];
  }[];
};

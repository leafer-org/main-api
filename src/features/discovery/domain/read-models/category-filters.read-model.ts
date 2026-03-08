import type { AttributeId, CategoryId, TypeId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

/**
 * Доступные фильтры для страницы категории. Собирается интерактором из
 * атрибутов категории (собственные + унаследованные от предков) и допустимых типов.
 */
export type CategoryFiltersReadModel = {
  categoryId: CategoryId;
  attributeFilters: {
    attributeId: AttributeId;
    name: string;
    schema: AttributeSchema;
  }[];
  typeFilters: {
    typeId: TypeId;
    name: string;
  }[];
  commonFilters: {
    hasPriceRange: boolean;
    hasRating: boolean;
    hasLocation: boolean;
    hasSchedule: boolean;
    hasEventDateTime: boolean;
  };
};

import type { CategoryId, MediaId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemListView } from './item-list-view.read-model.js';

export type CategorySuggestion = {
  categoryId: CategoryId;
  name: string;
};

export type ItemTypeSuggestion = {
  typeId: TypeId;
  name: string;
  parentCategoryId: CategoryId | null;
};

export type OrganizationSuggestion = {
  organizationId: OrganizationId;
  name: string;
  avatarId: MediaId | null;
};

export type QuerySuggestion = {
  text: string;
};

/**
 * Подсказки в строке поиска. Секции отдаются раздельно, фронт сам выбирает порядок/группировку.
 *  - categories     — совпадения по имени категории.
 *  - itemTypes      — совпадения по имени типа товара.
 *  - organizations  — совпадения по имени организации.
 *  - items          — топ-N товаров через Meilisearch (полный ItemListView, чтобы мобайл рендерил карточкой).
 *  - popularQueries — самые частые запросы по этому городу за всё время.
 */
export type SearchSuggestionsResult = {
  categories: CategorySuggestion[];
  itemTypes: ItemTypeSuggestion[];
  organizations: OrganizationSuggestion[];
  items: ItemListView[];
  popularQueries: QuerySuggestion[];
};

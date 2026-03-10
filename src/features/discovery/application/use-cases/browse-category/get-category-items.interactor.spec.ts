import { describe, expect, it } from 'vitest';

import type { ItemReadModel } from '../../../domain/read-models/item.read-model.js';
import type {
  CategoryAncestorLookupPort,
  ItemQueryPort,
  RankedListCachePort,
  RecommendationService,
} from '../../ports.js';
import { GetCategoryItemsInteractor } from './get-category-items.interactor.js';
import { isRight } from '@/infra/lib/box.js';
import { ServiceMock } from '@/infra/test/mock.js';
import type { CityCoordinatesPort } from '@/kernel/application/ports/city-coordinates.js';
import { CategoryId, ItemId, TypeId, UserId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const USER_ID = UserId.raw('user-1');
const CATEGORY_ID = CategoryId.raw('cat-1');
const CITY_ID = 'city-1';
const AGE_GROUP = 'adults' as const;

function makeItem(id: string, overrides?: Partial<ItemReadModel>): ItemReadModel {
  return {
    itemId: ItemId.raw(id),
    typeId: TypeId.raw('type-1'),
    baseInfo: { title: `Item ${id}`, description: '', imageId: null },
    publishedAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

const ROOT_CATEGORY_ID = CategoryId.raw('root-1');

function makeDeps() {
  const recommendation = ServiceMock<RecommendationService>();
  const rankedListCache = ServiceMock<RankedListCachePort>();
  const itemQuery = ServiceMock<ItemQueryPort>();
  const cityCoordinates = ServiceMock<CityCoordinatesPort>();
  const ancestorLookup = ServiceMock<CategoryAncestorLookupPort>();
  cityCoordinates.findCoordinates.mockResolvedValue(null);
  ancestorLookup.findRootCategoryIds.mockResolvedValue([ROOT_CATEGORY_ID]);
  return { recommendation, rankedListCache, itemQuery, cityCoordinates, ancestorLookup };
}

function makeInteractor(deps: ReturnType<typeof makeDeps>) {
  return new GetCategoryItemsInteractor(
    deps.recommendation,
    deps.rankedListCache,
    deps.itemQuery,
    deps.cityCoordinates,
    deps.ancestorLookup,
  );
}

const baseQuery = {
  userId: USER_ID,
  categoryId: CATEGORY_ID,
  cityId: CITY_ID,
  ageGroup: AGE_GROUP,
  filters: {},
  sort: 'personal' as const,
  limit: 20,
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('GetCategoryItemsInteractor', () => {
  describe('sort ≠ personal', () => {
    it('делегирует в SQL cursor-пагинацию', async () => {
      const deps = makeDeps();
      const items = [makeItem('1'), makeItem('2')];
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({
        items,
        nextCursor: 'next',
      });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute({ ...baseQuery, sort: 'newest' });

      expect(isRight(result)).toBe(true);
      expect(deps.itemQuery.findCategoryItemsSorted).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'newest', categoryId: CATEGORY_ID }),
      );
      expect(deps.recommendation.recommend).not.toHaveBeenCalled();
    });
  });

  describe('sort = personal', () => {
    it('запрашивает рекомендации у Gorse, фильтрует и кэширует', async () => {
      const deps = makeDeps();
      const ids = [ItemId.raw('a'), ItemId.raw('b'), ItemId.raw('c')];
      const items = [makeItem('a'), makeItem('b'), makeItem('c')];

      deps.rankedListCache.get.mockResolvedValue(null);
      deps.recommendation.recommend.mockResolvedValue(ids);
      // fetchAndRankGorseIds → findCategoryItemsSorted with includeIds
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValueOnce({ items, nextCursor: null });
      // backfill: findByIds for gorse page + findCategoryItemsSorted for newest
      deps.itemQuery.findByIds.mockResolvedValue(items);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValueOnce({ items: [], nextCursor: null });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute(baseQuery);

      expect(isRight(result)).toBe(true);
      expect(deps.recommendation.recommend).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          limit: 500,
        }),
      );
      expect(deps.rankedListCache.set).toHaveBeenCalledWith(
        expect.stringContaining('ranked:'),
        ids,
        5 * 60 * 1000,
      );
      if (isRight(result)) {
        expect(result.value.items).toHaveLength(3);
      }
    });

    it('использует кэшированные ID при повторном запросе', async () => {
      const deps = makeDeps();
      const cachedIds = [ItemId.raw('x'), ItemId.raw('y')];
      const items = [makeItem('x'), makeItem('y')];

      deps.rankedListCache.get.mockResolvedValue(cachedIds);
      deps.itemQuery.findByIds.mockResolvedValue(items);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({ items: [], nextCursor: null });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute(baseQuery);

      expect(isRight(result)).toBe(true);
      expect(deps.recommendation.recommend).not.toHaveBeenCalled();
      expect(deps.rankedListCache.set).not.toHaveBeenCalled();
      if (isRight(result)) {
        expect(result.value.items).toHaveLength(2);
      }
    });

    it('применяет SQL фильтры к рекомендациям через findCategoryItemsSorted', async () => {
      const deps = makeDeps();
      const ids = [ItemId.raw('a'), ItemId.raw('b')];
      const filteredItem = makeItem('a', { payment: { strategy: 'one-time', price: 500 } });

      deps.rankedListCache.get.mockResolvedValue(null);
      deps.recommendation.recommend.mockResolvedValue(ids);
      // SQL фильтрация возвращает только item 'a' (price <= 1000)
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValueOnce({
        items: [filteredItem],
        nextCursor: null,
      });
      // backfill: findByIds for gorse page + findCategoryItemsSorted for newest
      deps.itemQuery.findByIds.mockResolvedValue([filteredItem]);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValueOnce({ items: [], nextCursor: null });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute({
        ...baseQuery,
        filters: { priceRange: { max: 1000 } },
      });

      expect(isRight(result)).toBe(true);
      if (isRight(result)) {
        expect(result.value.items).toHaveLength(1);
        expect(result.value.items[0]?.itemId).toEqual(ItemId.raw('a'));
      }
      // Verify includeIds was passed
      expect(deps.itemQuery.findCategoryItemsSorted).toHaveBeenCalledWith(
        expect.objectContaining({ includeIds: ids }),
      );
    });

    it('fallback на SQL newest при пустых рекомендациях', async () => {
      const deps = makeDeps();
      deps.rankedListCache.get.mockResolvedValue(null);
      deps.recommendation.recommend.mockResolvedValue([]);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({
        items: [makeItem('f')],
        nextCursor: null,
      });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute(baseQuery);

      expect(isRight(result)).toBe(true);
      expect(deps.itemQuery.findCategoryItemsSorted).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'newest' }),
      );
    });

    it('fallback на SQL newest при ошибке Gorse', async () => {
      const deps = makeDeps();
      deps.rankedListCache.get.mockResolvedValue(null);
      deps.recommendation.recommend.mockRejectedValue(new Error('gorse down'));
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute(baseQuery);

      expect(isRight(result)).toBe(true);
      expect(deps.itemQuery.findCategoryItemsSorted).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'newest' }),
      );
    });

    it('fallback на SQL newest когда offset превышает кэш', async () => {
      const deps = makeDeps();
      deps.rankedListCache.get.mockResolvedValue([ItemId.raw('a')]);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute({ ...baseQuery, cursor: '20' });

      expect(isRight(result)).toBe(true);
      expect(deps.itemQuery.findCategoryItemsSorted).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'newest' }),
      );
    });

    it('дополняет последнюю страницу newest при частичном исчерпании gorse', async () => {
      const deps = makeDeps();
      const cachedIds = [
        ItemId.raw('a'),
        ItemId.raw('b'),
        ItemId.raw('c'),
        ItemId.raw('d'),
        ItemId.raw('e'),
      ];
      const newestItems = [makeItem('n1'), makeItem('n2')];

      deps.rankedListCache.get.mockResolvedValue(cachedIds);
      deps.itemQuery.findByIds.mockResolvedValue([makeItem('d'), makeItem('e')]);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({
        items: newestItems,
        nextCursor: null,
      });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute({ ...baseQuery, cursor: '3', limit: 4 });

      expect(isRight(result)).toBe(true);
      if (isRight(result)) {
        expect(result.value.items).toHaveLength(4);
        expect(result.value.items.map((i) => i.itemId)).toEqual([
          ItemId.raw('d'),
          ItemId.raw('e'),
          ItemId.raw('n1'),
          ItemId.raw('n2'),
        ]);
        expect(result.value.nextCursor).toBeNull();
      }

      expect(deps.itemQuery.findCategoryItemsSorted).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'newest',
          excludeIds: cachedIds,
          limit: 2,
        }),
      );
    });

    it('fallback на SQL newest с excludeIds когда offset превышает кэш', async () => {
      const deps = makeDeps();
      const cachedIds = [ItemId.raw('a'), ItemId.raw('b')];
      deps.rankedListCache.get.mockResolvedValue(cachedIds);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({
        items: [makeItem('n1')],
        nextCursor: null,
      });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute({ ...baseQuery, cursor: '20' });

      expect(isRight(result)).toBe(true);
      expect(deps.itemQuery.findCategoryItemsSorted).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'newest',
          excludeIds: cachedIds,
        }),
      );
    });

    it('разный ageGroup → разный cache key', async () => {
      const deps = makeDeps();
      deps.rankedListCache.get.mockResolvedValue(null);
      deps.recommendation.recommend.mockResolvedValue([]);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({ items: [], nextCursor: null });

      const interactor = makeInteractor(deps);

      await interactor.execute({ ...baseQuery, ageGroup: 'adults' });
      await interactor.execute({ ...baseQuery, ageGroup: 'children' });

      const calls = deps.rankedListCache.get.mock.calls;
      expect(calls[0]![0]).not.toBe(calls[1]![0]);
    });

    it('резолвит root-категорию через ancestorLookup', async () => {
      const deps = makeDeps();
      deps.rankedListCache.get.mockResolvedValue(null);
      deps.recommendation.recommend.mockResolvedValue([ItemId.raw('a')]);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValue({
        items: [makeItem('a')],
        nextCursor: null,
      });
      deps.itemQuery.findByIds.mockResolvedValue([makeItem('a')]);

      const interactor = makeInteractor(deps);
      await interactor.execute(baseQuery);

      expect(deps.ancestorLookup.findRootCategoryIds).toHaveBeenCalledWith([CATEGORY_ID]);
    });

    it('сохраняет порядок Gorse после фильтрации', async () => {
      const deps = makeDeps();
      const ids = [ItemId.raw('c'), ItemId.raw('a'), ItemId.raw('b')];
      const items = [makeItem('a'), makeItem('b'), makeItem('c')];

      deps.rankedListCache.get.mockResolvedValue(null);
      deps.recommendation.recommend.mockResolvedValue(ids);
      // fetchAndRankGorseIds → findCategoryItemsSorted (returns items in DB order)
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValueOnce({ items, nextCursor: null });
      // backfill: findByIds for gorse page + findCategoryItemsSorted for newest
      deps.itemQuery.findByIds.mockResolvedValue(items);
      deps.itemQuery.findCategoryItemsSorted.mockResolvedValueOnce({ items: [], nextCursor: null });

      const interactor = makeInteractor(deps);
      const result = await interactor.execute(baseQuery);

      expect(isRight(result)).toBe(true);
      if (isRight(result)) {
        const resultIds = result.value.items.map((i) => i.itemId);
        expect(resultIds).toEqual([ItemId.raw('c'), ItemId.raw('a'), ItemId.raw('b')]);
      }
    });
  });
});

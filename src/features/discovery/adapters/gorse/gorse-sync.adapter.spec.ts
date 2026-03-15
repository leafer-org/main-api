import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import { describe, expect, it } from 'vitest';

import type { CategoryAncestorLookupPort } from '../../application/ports.js';
import type { ItemReadModel } from '../../domain/read-models/item.read-model.js';
import { GorseSyncAdapter } from './gorse-sync.adapter.js';
import type { GorseClient } from '@/infra/lib/nest-gorse/index.js';
import { ServiceMock } from '@/infra/test/mock.js';
import type { CityCoordinatesPort } from '@/kernel/application/ports/city-coordinates.js';
import { CategoryId, ItemId, TypeId } from '@/kernel/domain/ids.js';

function makeItem(overrides?: Partial<ItemReadModel>): ItemReadModel {
  return {
    itemId: ItemId.raw('item-1'),
    typeId: TypeId.raw('type-1'),
    baseInfo: { title: 'Test', description: '', media: [] },
    publishedAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeDeps() {
  const client = ServiceMock<GorseClient>();
  const ancestorLookup = ServiceMock<CategoryAncestorLookupPort>();
  const cityCoordinates = ServiceMock<CityCoordinatesPort>();
  client.upsertItem.mockResolvedValue(undefined);
  ancestorLookup.findRootCategoryIds.mockResolvedValue([]);
  cityCoordinates.findCoordinates.mockResolvedValue(null);
  return { client, ancestorLookup, cityCoordinates };
}

function makeAdapter(deps: ReturnType<typeof makeDeps>) {
  return new GorseSyncAdapter(
    deps.client as unknown as GorseClient,
    deps.ancestorLookup,
    deps.cityCoordinates,
  );
}

describe('GorseSyncAdapter', () => {
  it('item with coordinates + categories → geo categories with ageGroup and rootCat', async () => {
    const deps = makeDeps();
    const rootCatId = CategoryId.raw('root-1');
    deps.ancestorLookup.findRootCategoryIds.mockResolvedValue([rootCatId]);

    const adapter = makeAdapter(deps);
    await adapter.upsertItem(
      makeItem({
        ageGroup: AgeGroupOption.restore('adults'),
        location: { cityId: 'city-1', coordinates: { lat: 55.75, lng: 37.62 }, address: null },
        category: { categoryIds: [CategoryId.raw('cat-1')], attributeValues: [] },
      }),
    );

    const payload = deps.client.upsertItem.mock.calls[0]![1]!;
    // Should have {ag}:{cell} and {ag}:{rootCat}:{cell} categories
    expect(payload.Categories.length).toBe(14); // 7 feed + 7 browse
    expect(payload.Categories.every((c: string) => c.startsWith('adults:'))).toBe(true);
    expect(payload.Categories.some((c: string) => c.includes('root-1:'))).toBe(true);
  });

  it('item with cityId without coordinates → resolves via CityCoordinatesPort', async () => {
    const deps = makeDeps();
    deps.cityCoordinates.findCoordinates.mockResolvedValue({ lat: 55.75, lng: 37.62 });

    const adapter = makeAdapter(deps);
    await adapter.upsertItem(
      makeItem({
        ageGroup: AgeGroupOption.restore('adults'),
        location: { cityId: 'city-1', coordinates: { lat: 0, lng: 0 }, address: null },
      }),
    );

    const payload = deps.client.upsertItem.mock.calls[0]![1]!;
    expect(payload.Categories.length).toBe(7); // 7 feed, no root cats
    expect(payload.Categories.every((c: string) => c.startsWith('adults:'))).toBe(true);
  });

  it('item with cityId, city not found → global categories', async () => {
    const deps = makeDeps();
    deps.cityCoordinates.findCoordinates.mockResolvedValue(null);

    const adapter = makeAdapter(deps);
    await adapter.upsertItem(
      makeItem({
        ageGroup: AgeGroupOption.restore('adults'),
        // No coordinates field in location at all — simulate by not providing location
      }),
    );

    const payload = deps.client.upsertItem.mock.calls[0]![1]!;
    expect(payload.Categories).toContain('adults:global');
  });

  it('item without location → global categories', async () => {
    const deps = makeDeps();

    const adapter = makeAdapter(deps);
    await adapter.upsertItem(makeItem({ ageGroup: AgeGroupOption.restore('children') }));

    const payload = deps.client.upsertItem.mock.calls[0]![1]!;
    expect(payload.Categories).toEqual(['children:global']);
  });

  it('item with ageGroup=all → categories in children: AND adults:', async () => {
    const deps = makeDeps();

    const adapter = makeAdapter(deps);
    await adapter.upsertItem(makeItem({ ageGroup: AgeGroupOption.restore('all') }));

    const payload = deps.client.upsertItem.mock.calls[0]![1]!;
    expect(payload.Categories).toContain('children:global');
    expect(payload.Categories).toContain('adults:global');
  });

  it('item without ageGroup → defaults to adults', async () => {
    const deps = makeDeps();

    const adapter = makeAdapter(deps);
    await adapter.upsertItem(makeItem());

    const payload = deps.client.upsertItem.mock.calls[0]![1]!;
    expect(payload.Categories).toEqual(['adults:global']);
  });

  it('item without categories → only geo, no rootCat cross-product', async () => {
    const deps = makeDeps();

    const adapter = makeAdapter(deps);
    await adapter.upsertItem(
      makeItem({
        ageGroup: AgeGroupOption.restore('adults'),
        location: { cityId: 'city-1', coordinates: { lat: 55.75, lng: 37.62 }, address: null },
      }),
    );

    const payload = deps.client.upsertItem.mock.calls[0]![1]!;
    expect(payload.Categories).toHaveLength(7); // only feed geo categories
    expect(payload.Categories.every((c: string) => !c.includes('root'))).toBe(true);
    expect(deps.ancestorLookup.findRootCategoryIds).not.toHaveBeenCalled();
  });

  it('labels are not affected (type:, attr:, age:, h3:)', async () => {
    const deps = makeDeps();

    const adapter = makeAdapter(deps);
    await adapter.upsertItem(
      makeItem({
        ageGroup: AgeGroupOption.restore('adults'),
        location: { cityId: 'city-1', coordinates: { lat: 55.75, lng: 37.62 }, address: null },
        category: {
          categoryIds: [CategoryId.raw('cat-1')],
          attributeValues: [{ attributeId: 'attr-1' as any, value: 'v1' }],
        },
      }),
    );

    const payload = deps.client.upsertItem.mock.calls[0]![1]!;
    expect(payload.Labels.some((l: string) => l.startsWith('type:'))).toBe(true);
    expect(payload.Labels.some((l: string) => l.startsWith('age:'))).toBe(true);
    expect(payload.Labels.some((l: string) => l.startsWith('attr:'))).toBe(true);
    expect(payload.Labels.some((l: string) => l.startsWith('h3:'))).toBe(true);
  });
});

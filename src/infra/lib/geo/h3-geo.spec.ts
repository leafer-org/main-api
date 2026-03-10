import { getResolution, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';

import {
  h3Labels,
  itemGeoCategories,
  itemGlobalCategories,
  userGeoCategory,
  userGeoCategoryWithCatalog,
  userGlobalCategory,
  userGlobalCategoryWithCatalog,
} from './h3-geo.js';

const LAT = 55.75;
const LNG = 37.62;

describe('h3-geo', () => {
  describe('itemGeoCategories', () => {
    it('returns 7 feed categories per ageGroup', () => {
      const cats = itemGeoCategories(LAT, LNG, ['adults'], []);
      expect(cats).toHaveLength(7);
      for (const c of cats) {
        expect(c).toMatch(/^adults:/);
      }
    });

    it('returns 7 feed + 7×N browse categories per ageGroup', () => {
      const cats = itemGeoCategories(LAT, LNG, ['adults'], ['root-1', 'root-2']);
      // 7 feed + 7*2 browse = 21
      expect(cats).toHaveLength(21);
    });

    it('with empty rootCategoryIds returns only 7 feed categories', () => {
      const cats = itemGeoCategories(LAT, LNG, ['children'], []);
      expect(cats).toHaveLength(7);
      expect(cats.every((c) => c.startsWith('children:'))).toBe(true);
    });

    it('with two ageGroups doubles the output', () => {
      const single = itemGeoCategories(LAT, LNG, ['adults'], ['root-1']);
      const double = itemGeoCategories(LAT, LNG, ['children', 'adults'], ['root-1']);
      expect(double).toHaveLength(single.length * 2);
    });

    it('browse categories have format {ag}:{rootCat}:{cell}', () => {
      const cats = itemGeoCategories(LAT, LNG, ['adults'], ['root-1']);
      const browseCats = cats.filter((c) => c.includes('root-1'));
      expect(browseCats).toHaveLength(7);
      for (const c of browseCats) {
        expect(c).toMatch(/^adults:root-1:/);
      }
    });
  });

  describe('itemGlobalCategories', () => {
    it('returns {ag}:global for feed', () => {
      const cats = itemGlobalCategories(['adults'], []);
      expect(cats).toEqual(['adults:global']);
    });

    it('returns {ag}:global + {ag}:{root}:global for each root', () => {
      const cats = itemGlobalCategories(['adults'], ['root-1', 'root-2']);
      expect(cats).toEqual([
        'adults:global',
        'adults:root-1:global',
        'adults:root-2:global',
      ]);
    });

    it('duplicates for multiple ageGroups', () => {
      const cats = itemGlobalCategories(['children', 'adults'], ['root-1']);
      expect(cats).toEqual([
        'children:global',
        'children:root-1:global',
        'adults:global',
        'adults:root-1:global',
      ]);
    });
  });

  describe('userGeoCategory', () => {
    it('returns {ageGroup}:{cell}', () => {
      const cat = userGeoCategory(LAT, LNG, 'adults');
      const cell = latLngToCell(LAT, LNG, 3);
      expect(cat).toBe(`adults:${cell}`);
    });
  });

  describe('userGeoCategoryWithCatalog', () => {
    it('returns {ageGroup}:{rootCat}:{cell}', () => {
      const cat = userGeoCategoryWithCatalog(LAT, LNG, 'children', 'root-1');
      const cell = latLngToCell(LAT, LNG, 3);
      expect(cat).toBe(`children:root-1:${cell}`);
    });
  });

  describe('userGlobalCategory', () => {
    it('returns {ageGroup}:global', () => {
      expect(userGlobalCategory('adults')).toBe('adults:global');
    });
  });

  describe('userGlobalCategoryWithCatalog', () => {
    it('returns {ageGroup}:{rootCat}:global', () => {
      expect(userGlobalCategoryWithCatalog('children', 'root-1')).toBe('children:root-1:global');
    });
  });

  describe('resolution', () => {
    it('uses H3 resolution 3', () => {
      const cats = itemGeoCategories(LAT, LNG, ['adults'], []);
      // Extract cell from first category: "adults:{cell}"
      const cell = cats[0]!.split(':').slice(1).join(':');
      expect(getResolution(cell)).toBe(3);
    });
  });

  describe('h3Labels', () => {
    it('returns labels at resolutions 4, 5, 6', () => {
      const labels = h3Labels(LAT, LNG);
      expect(labels).toHaveLength(3);
      expect(labels[0]).toMatch(/^h3:4:/);
      expect(labels[1]).toMatch(/^h3:5:/);
      expect(labels[2]).toMatch(/^h3:6:/);
    });
  });
});

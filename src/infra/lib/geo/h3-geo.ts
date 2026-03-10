import { gridDisk, latLngToCell } from 'h3-js';

const GEO_RESOLUTION = 3; // ~60km hexagonal cells

/**
 * H3 geo-categories for a Gorse item.
 * The item is placed in its own cell + 6 neighbors (gridDisk radius 1).
 * Each cell is prefixed with ageGroup, and optionally combined with rootCategoryIds.
 *
 * Format: `{ag}:{cell}` for feed, `{ag}:{rootCat}:{cell}` for category browsing.
 */
export function itemGeoCategories(
  lat: number,
  lng: number,
  ageGroups: string[],
  rootCategoryIds: string[],
): string[] {
  const cell = latLngToCell(lat, lng, GEO_RESOLUTION);
  const cells = gridDisk(cell, 1); // 7 cells: own + 6 neighbors

  const categories: string[] = [];

  for (const ag of ageGroups) {
    // Feed categories: {ag}:{cell}
    for (const c of cells) {
      categories.push(`${ag}:${c}`);
    }

    // Browse categories: {ag}:{rootCat}:{cell}
    for (const rootCat of rootCategoryIds) {
      for (const c of cells) {
        categories.push(`${ag}:${rootCat}:${c}`);
      }
    }
  }

  return categories;
}

/**
 * Global categories for items without geo coordinates.
 * Format: `{ag}:global` for feed, `{ag}:{rootCat}:global` for category browsing.
 */
export function itemGlobalCategories(ageGroups: string[], rootCategoryIds: string[]): string[] {
  const categories: string[] = [];

  for (const ag of ageGroups) {
    categories.push(`${ag}:global`);

    for (const rootCat of rootCategoryIds) {
      categories.push(`${ag}:${rootCat}:global`);
    }
  }

  return categories;
}

/**
 * Single H3 geo-category for a user recommendation query (feed, no catalog filter).
 * Format: `{ageGroup}:{cell}`
 */
export function userGeoCategory(lat: number, lng: number, ageGroup: string): string {
  return `${ageGroup}:${latLngToCell(lat, lng, GEO_RESOLUTION)}`;
}

/**
 * Combined geo+catalog category for a user recommendation query filtered by root catalog category.
 * Format: `{ageGroup}:{rootCategoryId}:{cell}`
 */
export function userGeoCategoryWithCatalog(
  lat: number,
  lng: number,
  ageGroup: string,
  rootCategoryId: string,
): string {
  const cell = latLngToCell(lat, lng, GEO_RESOLUTION);
  return `${ageGroup}:${rootCategoryId}:${cell}`;
}

/**
 * Global category for user without coordinates (feed).
 * Format: `{ageGroup}:global`
 */
export function userGlobalCategory(ageGroup: string): string {
  return `${ageGroup}:global`;
}

/**
 * Global category for user without coordinates (category browsing).
 * Format: `{ageGroup}:{rootCategoryId}:global`
 */
export function userGlobalCategoryWithCatalog(ageGroup: string, rootCategoryId: string): string {
  return `${ageGroup}:${rootCategoryId}:global`;
}

/**
 * H3 labels for Gorse item content-based recommendations at multiple resolutions.
 */
export function h3Labels(lat: number, lng: number): string[] {
  return [
    `h3:4:${latLngToCell(lat, lng, 4)}`, // ~30km — coarse
    `h3:5:${latLngToCell(lat, lng, 5)}`, // ~10km — medium
    `h3:6:${latLngToCell(lat, lng, 6)}`, // ~3km — fine
  ];
}

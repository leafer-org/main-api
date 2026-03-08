import { Controller, Get, Param, Query } from '@nestjs/common';

import { GetCategoryItemsInteractor } from '../../application/use-cases/browse-category/get-category-items.interactor.js';
import type {
  AttributeFilter,
  CategoryItemFilters,
  SortOption,
} from '../../application/use-cases/browse-category/types.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import type { PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { AttributeId, CategoryId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

type RawFilterParams = {
  typeIds?: string;
  priceMin?: number;
  priceMax?: number;
  minRating?: number;
  attributeFilters?: string;
  lat?: string;
  lng?: string;
  radiusKm?: string;
  dateFrom?: string;
  dateTo?: string;
  scheduleDayOfWeek?: string;
  scheduleTimeFrom?: string;
  scheduleTimeTo?: string;
};

type RawAttributeFilter =
  | { attributeId: string; type: 'enum'; values: string[] }
  | { attributeId: string; type: 'number'; min?: number; max?: number }
  | { attributeId: string; type: 'boolean'; value: boolean }
  | { attributeId: string; type: 'text'; value: string };

function parseFilters(raw: RawFilterParams): CategoryItemFilters {
  const filters: CategoryItemFilters = {};

  if (raw.typeIds) {
    filters.typeIds = raw.typeIds.split(',').map((t) => TypeId.raw(t.trim()));
  }

  if (raw.priceMin !== undefined || raw.priceMax !== undefined) {
    filters.priceRange = {
      min: raw.priceMin,
      max: raw.priceMax,
    };
  }

  if (raw.minRating !== undefined) {
    filters.minRating = raw.minRating;
  }

  if (raw.attributeFilters) {
    const parsed = JSON.parse(raw.attributeFilters) as RawAttributeFilter[];
    filters.attributeFilters = parsed.map(
      (a): AttributeFilter =>
        ({
          ...a,
          attributeId: AttributeId.raw(a.attributeId),
        }) as AttributeFilter,
    );
  }

  if (raw.lat !== undefined && raw.lng !== undefined && raw.radiusKm !== undefined) {
    filters.geoRadius = {
      lat: Number(raw.lat),
      lng: Number(raw.lng),
      radiusKm: Number(raw.radiusKm),
    };
  }

  if (raw.dateFrom !== undefined && raw.dateTo !== undefined) {
    filters.dateRange = { from: new Date(raw.dateFrom), to: new Date(raw.dateTo) };
  }

  if (raw.scheduleDayOfWeek !== undefined) {
    filters.scheduleDayOfWeek = Number(raw.scheduleDayOfWeek);
  }

  if (raw.scheduleTimeFrom !== undefined && raw.scheduleTimeTo !== undefined) {
    filters.scheduleTimeOfDay = { from: raw.scheduleTimeFrom, to: raw.scheduleTimeTo };
  }

  return filters;
}

@Controller('categories')
export class CategoryItemsController {
  public constructor(private readonly getCategoryItems: GetCategoryItemsInteractor) {}

  @Public()
  @Get(':id/items')
  public async getItems(
    @Param('id') id: string,
    @Query('sort') sort?: PublicQuery['getCategoryItems']['sort'],
    @Query('cursor') cursor?: PublicQuery['getCategoryItems']['cursor'],
    @Query('limit') limit?: PublicQuery['getCategoryItems']['limit'],
    @Query('cityId') cityId?: PublicQuery['getCategoryItems']['cityId'],
    @Query('ageGroup') ageGroup?: PublicQuery['getCategoryItems']['ageGroup'],
    @Query('typeIds') typeIds?: PublicQuery['getCategoryItems']['typeIds'],
    @Query('priceMin') priceMin?: PublicQuery['getCategoryItems']['priceMin'],
    @Query('priceMax') priceMax?: PublicQuery['getCategoryItems']['priceMax'],
    @Query('minRating') minRating?: PublicQuery['getCategoryItems']['minRating'],
    @Query('attributeFilters') attributeFilters?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('scheduleDayOfWeek') scheduleDayOfWeek?: string,
    @Query('scheduleTimeFrom') scheduleTimeFrom?: string,
    @Query('scheduleTimeTo') scheduleTimeTo?: string,
  ): Promise<PublicResponse['getCategoryItems']> {
    const filters = parseFilters({
      typeIds,
      priceMin,
      priceMax,
      minRating,
      attributeFilters,
      lat,
      lng,
      radiusKm,
      dateFrom,
      dateTo,
      scheduleDayOfWeek,
      scheduleTimeFrom,
      scheduleTimeTo,
    });

    const result = await this.getCategoryItems.execute({
      categoryId: CategoryId.raw(id),
      sort: (sort ?? 'personal') as SortOption,
      cityId: cityId ?? '',
      ageGroup: (ageGroup ?? 'adults') as AgeGroup,
      filters,
      cursor: cursor ?? undefined,
      limit: Number(limit ?? 20),
    });

    return result.value as PublicResponse['getCategoryItems'];
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { toListView } from '../../../domain/mappers/item-list-view.mapper.js';
import {
  ItemCardEnrichmentPort,
  ItemQueryPort,
  OrganizationProfileQueryPort,
} from '../../ports.js';
import { OrganizationNotFoundError } from './errors.js';
import { Left, Right } from '@/infra/lib/box.js';

const ITEMS_LIMIT = 50;

/**
 * Публичная страница организации в discovery: профиль + последние товары.
 * Пагинации пока нет — отдаём до 50 последних. Источник: `discovery_owners`
 * + `discovery_items` (фильтр по organization_id).
 */
@Injectable()
export class GetOrganizationDetailInteractor {
  public constructor(
    @Inject(OrganizationProfileQueryPort)
    private readonly profileQuery: OrganizationProfileQueryPort,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
    @Inject(ItemCardEnrichmentPort) private readonly cardEnrichment: ItemCardEnrichmentPort,
  ) {}

  public async execute(organizationId: string) {
    const profile = await this.profileQuery.findById(organizationId);
    if (!profile) {
      return Left(new OrganizationNotFoundError());
    }

    const items = await this.itemQuery.findByOrganization({
      organizationId,
      limit: ITEMS_LIMIT,
    });

    const enrichment = await this.cardEnrichment.enrich({
      items: items.map((i) => ({ itemId: i.itemId, typeId: i.typeId, widgets: i.widgets })),
    });

    return Right({
      profile,
      items: items.map((i) => toListView(i, enrichment.get(String(i.itemId)))),
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { ItemListReadModel } from '../../../domain/read-models/item-list.read-model.js';
import type { ItemDetailReadModel } from '../../../domain/read-models/item-detail.read-model.js';
import { ItemQueryPort } from '../../../application/ports.js';
import { OrganizationDatabaseClient } from '../client.js';
import { items } from '../schema.js';
import type { ItemId, OrganizationId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';
import type { ItemJsonState } from '../json-state.js';

@Injectable()
export class DrizzleItemQuery implements ItemQueryPort {
  public constructor(
    @Inject(OrganizationDatabaseClient) private readonly db: OrganizationDatabaseClient,
  ) {}

  public async findByOrganizationId(orgId: OrganizationId): Promise<ItemListReadModel> {
    const rows = await this.db
      .select()
      .from(items)
      .where(eq(items.organizationId, orgId));

    return {
      items: rows.map((row) => {
        const s = row.state as ItemJsonState;

        return {
          itemId: s.itemId as ItemListReadModel['items'][0]['itemId'],
          typeId: s.typeId as ItemListReadModel['items'][0]['typeId'],
          draftStatus: s.draft ? (s.draft.status as ItemListReadModel['items'][0]['draftStatus']) : null,
          hasPublication: s.publication !== null,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        };
      }),
    };
  }

  public async findDetail(itemId: ItemId): Promise<ItemDetailReadModel | null> {
    const rows = await this.db.select().from(items).where(eq(items.id, itemId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    const s = row.state as ItemJsonState;

    return {
      itemId: s.itemId as ItemDetailReadModel['itemId'],
      organizationId: s.organizationId as ItemDetailReadModel['organizationId'],
      typeId: s.typeId as ItemDetailReadModel['typeId'],
      draft: s.draft
        ? {
            widgets: s.draft.widgets as ItemWidget[],
            status: s.draft.status as ItemDetailReadModel['draft'] extends infer T
              ? T extends { status: infer S } ? S : never : never,
            updatedAt: new Date(s.draft.updatedAt),
          }
        : null,
      publication: s.publication
        ? {
            widgets: s.publication.widgets as ItemWidget[],
            publishedAt: new Date(s.publication.publishedAt),
          }
        : null,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    };
  }
}

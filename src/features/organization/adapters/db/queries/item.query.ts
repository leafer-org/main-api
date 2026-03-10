import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { ItemListReadModel } from '../../../domain/read-models/item-list.read-model.js';
import type { ItemDetailReadModel } from '../../../domain/read-models/item-detail.read-model.js';
import { ItemQueryPort } from '../../../application/ports.js';
import { OrganizationDatabaseClient } from '../client.js';
import { items } from '../schema.js';
import type { ItemId, OrganizationId } from '@/kernel/domain/ids.js';

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
        const state = row.state as Record<string, unknown>;
        const draft = state['draft'] as Record<string, unknown> | null;

        return {
          itemId: state['itemId'] as ItemListReadModel['items'][0]['itemId'],
          typeId: state['typeId'] as ItemListReadModel['items'][0]['typeId'],
          draftStatus: draft ? (draft['status'] as ItemListReadModel['items'][0]['draftStatus']) : null,
          hasPublication: state['publication'] !== null,
          createdAt: new Date(state['createdAt'] as string),
          updatedAt: new Date(state['updatedAt'] as string),
        };
      }),
    };
  }

  public async findDetail(itemId: ItemId): Promise<ItemDetailReadModel | null> {
    const rows = await this.db.select().from(items).where(eq(items.id, itemId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    const state = row.state as Record<string, unknown>;
    const draft = state['draft'] as Record<string, unknown> | null;
    const publication = state['publication'] as Record<string, unknown> | null;

    return {
      itemId: state['itemId'] as ItemDetailReadModel['itemId'],
      organizationId: state['organizationId'] as ItemDetailReadModel['organizationId'],
      typeId: state['typeId'] as ItemDetailReadModel['typeId'],
      draft: draft
        ? {
            widgets: draft['widgets'] as ItemDetailReadModel['draft'] extends infer T
              ? T extends { widgets: infer W } ? W : never : never,
            status: draft['status'] as 'draft' | 'moderation-request' | 'rejected',
            updatedAt: new Date(draft['updatedAt'] as string),
          }
        : null,
      publication: publication
        ? {
            widgets: publication['widgets'] as ItemDetailReadModel['publication'] extends infer T
              ? T extends { widgets: infer W } ? W : never : never,
            publishedAt: new Date(publication['publishedAt'] as string),
          }
        : null,
      createdAt: new Date(state['createdAt'] as string),
      updatedAt: new Date(state['updatedAt'] as string),
    } as ItemDetailReadModel;
  }
}

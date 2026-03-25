import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { ItemQueryPort } from '../../../application/ports.js';
import type { ItemDetailReadModel } from '../../../domain/read-models/item-detail.read-model.js';
import type { ItemListQuery, ItemListReadModel } from '../../../domain/read-models/item-list.read-model.js';
import { OrganizationDatabaseClient } from '../client.js';
import type { ItemJsonState } from '../json-state.js';
import { items } from '../schema.js';
import { decodeCursor, encodeCursor } from '@/infra/lib/pagination/index.js';
import type { ItemId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';

@Injectable()
export class DrizzleItemQuery implements ItemQueryPort {
  public constructor(
    @Inject(OrganizationDatabaseClient) private readonly db: OrganizationDatabaseClient,
  ) {}

  public async findList(query: ItemListQuery): Promise<ItemListReadModel> {
    const conditions = [eq(items.organizationId, query.organizationId)];

    if (query.search) {
      conditions.push(
        sql`${items.state}::text ILIKE ${`%${query.search}%`}`,
      );
    }

    if (query.cursor) {
      const parsed = decodeCursor<{ updatedAt: string; id: string }>(query.cursor);
      if (parsed) {
        conditions.push(
          sql`(${items.updatedAt}, ${items.id}) < (${parsed.updatedAt}::timestamptz, ${parsed.id}::uuid)`,
        );
      }
    }

    const rows = await this.db
      .select()
      .from(items)
      .where(and(...conditions))
      .orderBy(desc(items.updatedAt), desc(items.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const resultRows = hasMore ? rows.slice(0, query.limit) : rows;

    const mapped = resultRows.map((row) => {
      const s = row.state as ItemJsonState;
      const widgets = (s.draft?.widgets ?? s.publication?.widgets ?? []) as ItemWidget[];

      return {
        itemId: s.itemId as ItemListReadModel['items'][0]['itemId'],
        typeId: s.typeId as ItemListReadModel['items'][0]['typeId'],
        draftStatus: s.draft
          ? (s.draft.status as ItemListReadModel['items'][0]['draftStatus'])
          : null,
        hasPublication: s.publication !== null,
        widgets,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
      };
    });

    const lastRow = resultRows.at(-1);
    const nextCursor =
      hasMore && lastRow
        ? encodeCursor({ updatedAt: lastRow.updatedAt.toISOString(), id: lastRow.id })
        : null;

    return { items: mapped, nextCursor };
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
              ? T extends { status: infer S }
                ? S
                : never
              : never,
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
